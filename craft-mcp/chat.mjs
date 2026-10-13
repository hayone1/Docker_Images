// In-app chat: POST /<key>/<app>/chat runs a Claude conversation whose tools are the app CLI's own
// MCP tools, driving the same tab as an MCP client would (craft-remote.js shows it in the page).
//
//   request   {"chat": "<id>", "text": "..."}   or   {"chat": "<id>", "reset": true}
//   response  NDJSON lines: {"type":"text","text"} {"type":"tool","name"} {"type":"done"} {"type":"error","error"}
//
// Conversations live in memory, per key, app and chat id, and expire when idle.
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const MODEL = process.env.CHAT_MODEL || "claude-opus-5-5";
const EFFORT = process.env.CHAT_EFFORT || "medium";
const IDLE_MS = 60 * 60_000;
const MAX_TURNS = 40;

const TITLE = {
  photocraft: "PhotoCraft, a Photoshop-style image editor",
  vectorcraft: "VectorCraft, an Illustrator-style vector editor",
  lightcraft: "LightCraft, a Lightroom-style photo library and developer",
  filmcraft: "FilmCraft, a Premiere-style video editor",
  effectcraft: "EffectCraft, an After Effects-style motion graphics app",
};

const system = (app) => `You are the AI assistant built into ${TITLE[app] ?? app}, running in the user's browser tab.
You act on the document open in that tab through the tools. Inspect the current state before changing it, \
make the changes the user asks for, then say briefly what you did. Ask when a request is ambiguous. \
Keep replies short: the chat is a small panel next to the canvas. Use Markdown sparingly.`;

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
const agents = new Map(); // slot -> { client, tools, close, seen }
const chats = new Map(); // slot/chat -> { messages, busy, seen }

async function agent(slot, app, startCli) {
  let a = agents.get(slot);
  if (!a) {
    a = (async () => {
      const { cli, close } = await startCli(slot, app);
      const client = new Client({ name: "craft-chat", version: "1.0.0" });
      await client.connect(cli);
      const { tools } = await client.listTools();
      return {
        client,
        close,
        tools: tools.map((t) => ({ name: t.name, description: t.description ?? "", input_schema: t.inputSchema })),
      };
    })();
    agents.set(slot, a);
    a.catch(() => agents.delete(slot));
  }
  const ready = await a;
  ready.seen = Date.now();
  return ready;
}

// MCP tool result content -> tool_result content.
const toResult = (content = []) => content.flatMap((c) => {
  if (c.type === "text") return [{ type: "text", text: c.text }];
  if (c.type === "image") return [{ type: "image", source: { type: "base64", media_type: c.mimeType, data: c.data } }];
  if (c.type === "resource" && c.resource?.text) return [{ type: "text", text: c.resource.text }];
  return [];
});

// After a mid-output fallback, blocks the declined model produced before the last `fallback` marker
// (other than text) must not be echoed back.
const echoable = (content) => {
  const last = content.findLastIndex((b) => b.type === "fallback");
  if (last < 0) return content;
  return content.filter((b, i) => i > last || b.type === "text");
};

export async function handleChat(req, res, slot, app, body, startCli) {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" };
  if (req.method === "OPTIONS") return res.writeHead(204, { ...cors, "access-control-allow-methods": "POST" }).end();
  if (req.method !== "POST" || typeof body?.chat !== "string" || body.chat.length > 64) return res.writeHead(400, cors).end();
  if (!anthropic) {
    return res.writeHead(503, { ...cors, "content-type": "application/json" })
      .end(JSON.stringify({ error: "In-app chat is not set up on this server (no ANTHROPIC_API_KEY)." }));
  }
  const id = `${slot}/${body.chat}`;
  if (body.reset) {
    chats.delete(id);
    return res.writeHead(204, cors).end();
  }
  const text = String(body.text ?? "").trim();
  if (!text) return res.writeHead(400, cors).end();
  let chat = chats.get(id);
  if (chat?.busy) return res.writeHead(409, cors).end();
  if (!chat) chats.set(id, (chat = { messages: [] }));
  chat.busy = true;
  chat.seen = Date.now();

  res.writeHead(200, { ...cors, "content-type": "application/x-ndjson", "cache-control": "no-store", "x-accel-buffering": "no" });
  const emit = (event) => res.writableEnded || res.destroyed || res.write(`${JSON.stringify(event)}\n`);
  const abort = new AbortController();
  res.on("close", () => abort.abort());

  // Keep the history valid if this turn fails part-way: drop it back to where it started.
  const start = chat.messages.length;
  chat.messages.push({ role: "user", content: text });
  try {
    const { client, tools } = await agent(slot, app, startCli);
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const stream = anthropic.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        output_config: { effort: EFFORT },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        cache_control: { type: "ephemeral" },
        system: system(app),
        tools,
        messages: chat.messages,
      }, { signal: abort.signal });
      stream.on("text", (delta) => emit({ type: "text", text: delta }));
      const message = await stream.finalMessage();
      if (message.stop_reason === "refusal") {
        chat.messages.length = start;
        emit({ type: "error", error: "Claude declined this request." });
        break;
      }
      chat.messages.push({ role: "assistant", content: echoable(message.content) });
      if (message.stop_reason === "pause_turn") continue;
      const uses = message.content.filter((b) => b.type === "tool_use");
      if (message.stop_reason !== "tool_use" || !uses.length) {
        if (message.stop_reason === "max_tokens") emit({ type: "error", error: "The reply was cut off." });
        emit({ type: "done" });
        break;
      }
      const results = await Promise.all(uses.map(async (use) => {
        emit({ type: "tool", name: use.name });
        try {
          const r = await client.callTool({ name: use.name, arguments: use.input }, undefined, { timeout: 120_000 });
          return { type: "tool_result", tool_use_id: use.id, content: toResult(r.content), is_error: Boolean(r.isError) };
        } catch (e) {
          return { type: "tool_result", tool_use_id: use.id, content: String(e?.message ?? e), is_error: true };
        }
      }));
      chat.messages.push({ role: "user", content: results });
      if (abort.signal.aborted) break;
    }
  } catch (e) {
    // A turn cut short leaves no tool_use without its result; anything partial is dropped.
    const last = chat.messages.at(-1);
    if (last?.role === "assistant" && last.content.some?.((b) => b.type === "tool_use")) chat.messages.pop();
    if (chat.messages.length === start + 1) chat.messages.length = start;
    if (!abort.signal.aborted) {
      console.error(`chat ${app}: ${e}`);
      emit({ type: "error", error: e instanceof Anthropic.APIError ? `Claude API error ${e.status ?? ""}`.trim() : String(e?.message ?? e) });
    }
  } finally {
    chat.busy = false;
    chat.seen = Date.now();
    res.end();
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [id, chat] of chats) if (!chat.busy && now - chat.seen > IDLE_MS) chats.delete(id);
  for (const [slot, a] of agents) {
    a.then((ready) => {
      const used = [...chats.keys()].some((id) => id.startsWith(`${slot}/`));
      if (!used && now - ready.seen > IDLE_MS) {
        agents.delete(slot);
        ready.client.close().catch(() => {});
        ready.close();
      }
    }, () => {});
  }
}, 60_000).unref();
