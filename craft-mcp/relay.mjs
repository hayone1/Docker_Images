// MCP for the craft apps open in browser tabs. Each MCP session runs the app's CLI in bridge mode
// and relays its control-protocol requests to the tab opened with the same session key.
//
//   wss://<host>/<key>/tab/<app>       the tab (craft-remote.js)
//   https://<host>/<key>/<app>/mcp     the MCP client
//   node relay.mjs mint [hours]        prints a new key, valid for [hours] (default 24)
//   POST /mint?app=<app>&hours=<n>     the same as JSON          } for the proxy in front of the apps,
//   /storage/<app>/<action>            cloud storage (storage.mjs) } which sends X-Gateway-Secret: MCP_KEY
//
// A key is <expiry>.<nonce>.<signature> signed with MCP_KEY, so keys need no storage and expire.
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import net from "node:net";
import { createInterface } from "node:readline";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { WebSocketServer } from "ws";
import { handleStorage } from "./storage.mjs";

const MASTER = process.env.MCP_KEY ?? "";
if (MASTER.length < 16) throw new Error("MCP_KEY must be at least 16 characters");
const TIMEOUT_MS = 120_000;
const IDLE_MS = 60 * 60_000;

const BRIDGE = {
  photocraft: (p) => ["--bridge", `127.0.0.1:${p}`, "--control-token-file", "/tmp/control.token"],
  vectorcraft: (p) => ["--connect", `127.0.0.1:${p}`],
  lightcraft: (p) => ["--connect", `127.0.0.1:${p}`],
  filmcraft: (p) => ["--bridge", `127.0.0.1:${p}`],
  effectcraft: (p) => ["--bridge", `127.0.0.1:${p}`],
};

const PUBLIC_HOST = process.env.PUBLIC_HOST;
const MAX_HOURS = 30 * 24;

const sign = (payload) => createHmac("sha256", MASTER).update(payload).digest("base64url").slice(0, 32);
const same = (a, b) => Buffer.from(a).length === Buffer.from(b).length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const mint = (hours) => {
  const expiry = Math.floor(Date.now() / 1000) + Math.round(Math.min(Math.max(hours, 1), MAX_HOURS) * 3600);
  const payload = `${expiry}.${randomBytes(9).toString("base64url")}`;
  return { key: `${payload}.${sign(payload)}`, expires: expiry * 1000 };
};

if (process.argv[2] === "mint") {
  console.log(mint(Number(process.argv[3] ?? 24)).key);
  process.exit(0);
}

const valid = (key) => {
  const [expiry, nonce, signature] = key?.split(".") ?? [];
  return Boolean(signature) && Number(expiry) * 1000 >= Date.now() && same(signature, sign(`${expiry}.${nonce}`));
};

const token = randomBytes(32).toString("hex");
writeFileSync("/tmp/control.token", token, { mode: 0o600 });

const tabs = new Map();
const waiting = new Map();
const sessions = new Map();
let nextId = 1;

const answer = (entry, reply) => {
  clearTimeout(entry.timer);
  waiting.delete(entry.relayId);
  if (!entry.socket.destroyed) entry.socket.write(`${JSON.stringify({ ...reply, id: entry.id })}\n`);
};

// The bridge server one CLI connects to, relaying to the tab of `slot` (<key>/<app>).
const controlServer = (slot) => net.createServer((socket) => {
  const reply = (msg) => socket.write(`${JSON.stringify(msg)}\n`);
  createInterface({ input: socket }).on("line", (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return reply({ id: null, ok: false, error: "bad JSON" }); }
    const id = msg.id ?? null;
    if (msg.method === "auth") {
      const ok = msg.params?.token === token;
      return reply(ok ? { id, ok, result: { authenticated: true } } : { id, ok, error: "authentication required" });
    }
    const tab = tabs.get(slot);
    if (!tab) return reply({ id, ok: false, error: "no tab is connected for this key; open the app with its relay link" });
    const relayId = nextId++;
    const entry = { slot, socket, id, relayId };
    entry.timer = setTimeout(() => answer(entry, { ok: false, error: "timeout" }), TIMEOUT_MS);
    waiting.set(relayId, entry);
    tab.send(JSON.stringify({ id: relayId, method: msg.method, params: msg.params ?? {} }));
  });
  socket.on("error", () => {});
});

async function openSession(key, app) {
  const control = controlServer(`${key}/${app}`);
  await new Promise((resolve) => control.listen(0, "127.0.0.1", resolve));
  const cli = new StdioClientTransport({ command: `${app}-cli`, args: ["mcp", ...BRIDGE[app](control.address().port)], stderr: "inherit" });
  const session = { key, app, seen: Date.now() };
  const http = new StreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
    onsessioninitialized: (id) => sessions.set(id, session),
  });
  session.http = http;
  session.close = () => {
    sessions.delete(http.sessionId);
    control.close();
    cli.close().catch(() => {});
    http.close().catch(() => {});
  };
  http.onmessage = (msg) => cli.send(msg).catch(() => session.close());
  cli.onmessage = (msg) => http.send(msg).catch(() => {});
  http.onclose = cli.onclose = session.close;
  await cli.start();
  await http.start();
  return session;
}

const readBody = async (req) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : undefined;
};

const fromProxy = (req) => same(req.headers["x-gateway-secret"] ?? "", MASTER);

const mintRequest = (req, res, url) => {
  const app = url.searchParams.get("app");
  if (req.method !== "POST" || !fromProxy(req) || !(app in BRIDGE) || !PUBLIC_HOST) {
    return res.writeHead(404).end();
  }
  const { key, expires } = mint(Number(url.searchParams.get("hours")) || 24);
  res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({
    expires,
    tab: `wss://${PUBLIC_HOST}/${key}/tab/${app}`,
    mcp: `https://${PUBLIC_HOST}/${key}/${app}/mcp`,
  }));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://relay");
  if (url.pathname === "/healthz") return res.end("ok");
  if (url.pathname === "/mint") return mintRequest(req, res, url);
  if (url.pathname.startsWith("/storage/")) {
    const [, , app, action] = url.pathname.split("/");
    if (!fromProxy(req) || !(app in BRIDGE)) return res.writeHead(404).end();
    return handleStorage(req, res, app, action, url);
  }
  const [key, app, leaf] = url.pathname.split("/").filter(Boolean);
  if (!valid(key) || !(app in BRIDGE) || leaf !== "mcp") return res.writeHead(404).end();
  try {
    const body = req.method === "POST" ? await readBody(req) : undefined;
    const id = req.headers["mcp-session-id"];
    let session = id && sessions.get(id);
    if (id && (!session || session.key !== key || session.app !== app)) return res.writeHead(404).end();
    if (!session) {
      if (body?.method !== "initialize") return res.writeHead(400).end();
      session = await openSession(key, app);
    }
    session.seen = Date.now();
    await session.http.handleRequest(req, res, body);
  } catch (e) {
    console.error(`${app}: ${e}`);
    if (!res.headersSent) res.writeHead(500).end();
  }
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 << 20 });
server.on("upgrade", (req, socket, head) => {
  const [key, tab, app] = new URL(req.url, "http://relay").pathname.split("/").filter(Boolean);
  if (!valid(key) || tab !== "tab" || !(app in BRIDGE)) return socket.destroy();
  const slot = `${key}/${app}`;
  wss.handleUpgrade(req, socket, head, (ws) => {
    tabs.get(slot)?.close(4000, "replaced by a newer tab");
    tabs.set(slot, ws);
    ws.isAlive = true;
    ws.on("pong", () => (ws.isAlive = true));
    ws.on("message", (data) => {
      let reply;
      try { reply = JSON.parse(data); } catch { return; }
      const entry = waiting.get(reply.id);
      if (entry?.slot === slot) answer(entry, reply);
    });
    ws.on("close", () => {
      if (tabs.get(slot) !== ws) return;
      tabs.delete(slot);
      for (const entry of waiting.values()) if (entry.slot === slot) answer(entry, { ok: false, error: "the tab disconnected" });
    });
  });
});

setInterval(() => {
  for (const ws of tabs.values()) {
    if (!ws.isAlive) ws.terminate();
    ws.isAlive = false;
    ws.ping();
  }
  for (const session of sessions.values()) if (Date.now() - session.seen > IDLE_MS) session.close();
}, 30_000);
server.listen(8080);
