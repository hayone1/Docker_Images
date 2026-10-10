// Serves each craft app's MCP (its own CLI in bridge mode, behind supergateway) and relays the
// CLI's control-protocol requests to the browser tab connected for that app.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import net from "node:net";
import { createInterface } from "node:readline";
import { WebSocketServer } from "ws";

const KEY = process.env.MCP_KEY;
const TIMEOUT_MS = 120_000;
if (!/^[\w-]{16,}$/.test(KEY ?? "")) throw new Error("MCP_KEY must be at least 16 URL-safe characters");

// app: [control port, MCP port, CLI bridge arguments]
const APPS = {
  photocraft: [7801, 8101, (p) => ["--bridge", `127.0.0.1:${p}`, "--control-token-file", "/tmp/control.token"]],
  vectorcraft: [7802, 8102, (p) => ["--connect", `127.0.0.1:${p}`]],
  lightcraft: [7803, 8103, (p) => ["--connect", `127.0.0.1:${p}`]],
  filmcraft: [7804, 8104, (p) => ["--bridge", `127.0.0.1:${p}`]],
  effectcraft: [7805, 8105, (p) => ["--bridge", `127.0.0.1:${p}`]],
};

const token = randomBytes(32).toString("hex");
writeFileSync("/tmp/control.token", token, { mode: 0o600 });

const tabs = new Map();
const waiting = new Map();
let nextId = 1;

const answer = (entry, reply) => {
  clearTimeout(entry.timer);
  waiting.delete(entry.relayId);
  if (!entry.socket.destroyed) entry.socket.write(`${JSON.stringify({ ...reply, id: entry.id })}\n`);
};

const failApp = (app, error) => {
  for (const entry of waiting.values()) if (entry.app === app) answer(entry, { ok: false, error });
};

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 << 20 });
const http = createServer((req, res) => {
  if (req.url === "/healthz") return res.end(JSON.stringify(Object.fromEntries(Object.keys(APPS).map((a) => [a, tabs.has(a)]))));
  res.writeHead(404).end();
});
http.on("upgrade", (req, socket, head) => {
  const [key, tab, app] = new URL(req.url, "http://relay").pathname.split("/").filter(Boolean);
  if (key !== KEY || tab !== "tab" || !(app in APPS)) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => {
    tabs.get(app)?.close(4000, "replaced by a newer tab");
    tabs.set(app, ws);
    console.log(`${app}: tab connected`);
    ws.isAlive = true;
    ws.on("pong", () => (ws.isAlive = true));
    ws.on("message", (data) => {
      let reply;
      try { reply = JSON.parse(data); } catch { return; }
      const entry = waiting.get(reply.id);
      if (entry?.app === app) answer(entry, reply);
    });
    ws.on("close", () => {
      if (tabs.get(app) !== ws) return;
      tabs.delete(app);
      failApp(app, `the ${app} tab disconnected`);
      console.log(`${app}: tab disconnected`);
    });
  });
});
setInterval(() => {
  for (const ws of tabs.values()) {
    if (!ws.isAlive) ws.terminate();
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);
http.listen(8080);

for (const [app, [controlPort, mcpPort, bridge]] of Object.entries(APPS)) {
  net.createServer((socket) => {
    createInterface({ input: socket }).on("line", (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch {
        return socket.write(`${JSON.stringify({ id: null, ok: false, error: "bad JSON" })}\n`);
      }
      const id = msg.id ?? null;
      if (msg.method === "auth") {
        const ok = msg.params?.token === token;
        return socket.write(`${JSON.stringify(ok ? { id, ok, result: { authenticated: true } } : { id, ok, error: "authentication required" })}\n`);
      }
      const tab = tabs.get(app);
      if (!tab) {
        return socket.write(`${JSON.stringify({ id, ok: false, error: `no ${app} tab is connected; open ${app} in the browser with its relay link` })}\n`);
      }
      const relayId = nextId++;
      const entry = { app, socket, id, relayId };
      entry.timer = setTimeout(() => answer(entry, { ok: false, error: "timeout" }), TIMEOUT_MS);
      waiting.set(relayId, entry);
      tab.send(JSON.stringify({ id: relayId, method: msg.method, params: msg.params ?? {} }));
    });
    socket.on("error", () => {});
  }).listen(controlPort, "127.0.0.1");

  const command = [`${app}-cli`, "mcp", ...bridge(controlPort)].join(" ");
  spawn("supergateway", [
    "--stdio", command,
    "--outputTransport", "streamableHttp",
    "--stateful",
    "--port", String(mcpPort),
    "--streamableHttpPath", `/${KEY}/${app}/mcp`,
    "--healthEndpoint", "/healthz",
  ], { stdio: "inherit" }).on("exit", (code) => {
    console.error(`${app}: supergateway exited with ${code}`);
    process.exit(1);
  });
}
