// In-app chat: POST /<key>/<app>/chat runs Claude Code (the Agent SDK), signed in with the
// subscription token from `claude setup-token` (CLAUDE_CODE_OAUTH_TOKEN). Its only tools are the app
// CLI's MCP tools, bridged to the same tab an MCP client would drive; craft-remote.js shows it in
// the page.
//
//   request   {"chat": "<id>", "text": "..."}   or   {"chat": "<id>", "reset": true}
//   response  NDJSON lines: {"type":"text","text"} {"type":"tool","name"} {"type":"done"} {"type":"error","error"}
//
// Each chat id maps to a Claude Code session, resumed on the next message and forgotten when idle.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";

const IDLE_MS = 60 * 60_000;
const WORKDIR = join(tmpdir(), "craft-chat");
mkdirSync(WORKDIR, { recursive: true });

const TITLE = {
  photocraft: "PhotoCraft, a Photoshop-style image editor",
  vectorcraft: "VectorCraft, an Illustrator-style vector editor",
  lightcraft: "LightCraft, a Lightroom-style photo library and developer",
  filmcraft: "FilmCraft, a Premiere-style video editor",
  effectcraft: "EffectCraft, an After Effects-style motion graphics app",
};

const system = (app) => `You are the AI assistant built into ${TITLE[app] ?? app}, running in the user's browser tab.
You act on the document open in that tab through the ${app} tools. Inspect the current state before changing it, \
make the changes the user asks for, then say briefly what you did. Ask when a request is ambiguous. \
Keep replies short: the chat is a small panel next to the canvas. Use Markdown sparingly.`;

const bridges = new Map(); // slot -> Promise<{ command, args, close }>, one bridge server per tab
const chats = new Map(); // slot/chat -> { session, busy, seen }

export async function handleChat(req, res, slot, app, body, bridge) {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" };
  if (req.method === "OPTIONS") return res.writeHead(204, { ...cors, "access-control-allow-methods": "POST" }).end();
  if (req.method !== "POST" || typeof body?.chat !== "string" || body.chat.length > 64) return res.writeHead(400, cors).end();
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return res.writeHead(503, { ...cors, "content-type": "application/json" })
      .end(JSON.stringify({ error: "In-app chat is not set up on this server: it needs a Claude Code token (claude setup-token)." }));
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
  if (!chat) chats.set(id, (chat = {}));
  chat.busy = true;
  chat.seen = Date.now();

  res.writeHead(200, { ...cors, "content-type": "application/x-ndjson", "cache-control": "no-store", "x-accel-buffering": "no" });
  const emit = (event) => res.writableEnded || res.destroyed || res.write(`${JSON.stringify(event)}\n`);
  const abortController = new AbortController();
  res.on("close", () => abortController.abort());

  try {
    if (!bridges.has(slot)) {
      const b = bridge(slot, app);
      bridges.set(slot, b);
      b.catch(() => bridges.delete(slot));
    }
    const { command, args } = await bridges.get(slot);
    const run = query({
      prompt: text,
      options: {
        cwd: WORKDIR,
        systemPrompt: system(app),
        ...(process.env.CHAT_MODEL && { model: process.env.CHAT_MODEL }),
        ...(process.env.CHAT_EFFORT && { effort: process.env.CHAT_EFFORT }),
        // No built-in tools (files, shell, web): only the app's own.
        tools: [],
        mcpServers: { [app]: { type: "stdio", command, args, timeout: 120_000 } },
        allowedTools: [`mcp__${app}__*`],
        permissionMode: "dontAsk",
        settingSources: [],
        includePartialMessages: true,
        ...(chat.session && { resume: chat.session }),
        abortController,
      },
    });
    let failed = false;
    for await (const m of run) {
      if (m.session_id) chat.session = m.session_id;
      if (m.type === "stream_event") {
        const e = m.event;
        if (e.type === "content_block_delta" && e.delta.type === "text_delta") emit({ type: "text", text: e.delta.text });
      } else if (m.type === "assistant") {
        for (const block of m.message.content) {
          if (block.type === "tool_use") emit({ type: "tool", name: block.name.replace(`mcp__${app}__`, "") });
        }
        if (m.error) emit({ type: "error", error: m.error === "rate_limit" ? "Your Claude plan's usage limit was reached." : `Claude error: ${m.error}` });
      } else if (m.type === "result" && m.is_error) {
        failed = true;
        emit({ type: "error", error: m.errors?.join("\n") || (m.subtype === "error_max_turns" ? "Stopped after too many steps." : "Claude Code stopped with an error.") });
      }
    }
    if (!failed) emit({ type: "done" });
  } catch (e) {
    if (!abortController.signal.aborted) {
      console.error(`chat ${app}: ${e}`);
      emit({ type: "error", error: String(e?.message ?? e) });
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
  for (const [slot, b] of bridges) {
    if ([...chats.keys()].some((id) => id.startsWith(`${slot}/`))) continue;
    bridges.delete(slot);
    b.then((ready) => ready.close(), () => {});
  }
}, 60_000).unref();
