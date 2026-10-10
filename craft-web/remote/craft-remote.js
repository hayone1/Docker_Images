// Relays control-protocol requests from craft-mcp to this tab. Open the app once with
// ?relay=<wss url>; the URL is remembered and removed from the address bar.
(() => {
  const app = document.currentScript.dataset.app;
  const params = new URLSearchParams(location.search);
  let relay = params.get("relay");
  try {
    if (relay) localStorage.setItem("craftRelay", relay);
    else relay = localStorage.getItem("craftRelay");
  } catch {}
  if (!relay) return;
  if (params.has("relay")) {
    params.delete("relay");
    history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : "") + location.hash);
  }

  const badge = document.createElement("div");
  badge.style.cssText = "position:fixed;right:6px;bottom:6px;z-index:9;width:10px;height:10px;border-radius:50%;pointer-events:none";
  const show = (color, title) => { badge.style.background = color; badge.title = title; };
  document.addEventListener("DOMContentLoaded", () => document.body.append(badge));

  const api = () => window.craftRemote
    ? (m, p) => window.craftRemote.request(m, p)
    : window[app]?.request && ((m, p) => window[app].request(m, p).then(
        (result) => ({ ok: true, result }),
        (e) => ({ ok: false, error: String(e?.message ?? e) })));
  const ready = new Promise((resolve) => {
    const wait = () => (api() ? resolve(api()) : setTimeout(wait, 200));
    wait();
  });

  let delay = 1000;
  let ws;
  let timer;
  const connect = () => {
    ws = new WebSocket(relay);
    show("#e0a000", "MCP relay: connecting");
    ws.onopen = () => { delay = 1000; show("#2a2", "MCP relay: connected"); };
    ws.onclose = () => {
      show("#c33", "MCP relay: disconnected");
      timer = setTimeout(connect, delay);
      delay = Math.min(delay * 2, 30000);
    };
    ws.onmessage = async ({ data }) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      const request = await ready;
      const reply = await request(msg.method, msg.params ?? {}).catch((e) => ({ ok: false, error: String(e) }));
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ...reply, id: msg.id ?? null }));
    };
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && ws.readyState === WebSocket.CLOSED) {
      clearTimeout(timer);
      delay = 1000;
      connect();
    }
  });
  connect();
})();
