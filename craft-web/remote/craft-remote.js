// AI assistant: connects this tab to the craft-mcp relay so an MCP client (Claude, …) can drive it.
// The connection is created from the panel (POST _assistant/session, relative to the page, so it
// works at a site root or under craft-hub's /<app>/) or, as before, opened once with ?relay=<wss url>.
//
// window.craftAssistant exposes the connection to craft-hub's overlay, which then shows its own
// panel (chat and connect) instead of this one.
(() => {
  const app = document.currentScript.dataset.app;
  const title = { photocraft: "PhotoCraft", vectorcraft: "VectorCraft", lightcraft: "LightCraft", filmcraft: "FilmCraft", effectcraft: "EffectCraft" }[app] ?? app;
  // One origin can serve several apps (craft-hub), so the key names the app.
  const STORE = `craftAssistant:${app}`;
  const load = () => {
    try {
      const own = JSON.parse(localStorage.getItem(STORE));
      if (own) return own;
      const old = JSON.parse(localStorage.getItem("craftAssistant"));
      return old?.tab?.endsWith(`/tab/${app}`) ? old : null;
    } catch { return null; }
  };
  const save = (s) => { try { s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE); } catch {} };

  const params = new URLSearchParams(location.search);
  if (params.has("relay")) {
    const tab = params.get("relay");
    const parts = new URL(tab).pathname.split("/");
    const key = parts[parts.indexOf("tab") - 1];
    save({ tab, mcp: tab.replace(/^ws/, "http").replace(`/tab/${app}`, `/${app}/mcp`), expires: Number(key.split(".")[0]) * 1000 });
    params.delete("relay");
    history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : "") + location.hash);
  }
  let session = load();

  const api = () => window.craftRemote
    ? (m, p) => window.craftRemote.request(m, p)
    : window[app]?.request && ((m, p) => window[app].request(m, p).then(
        (result) => ({ ok: true, result }),
        (e) => ({ ok: false, error: String(e?.message ?? e) })));
  const ready = new Promise((resolve) => {
    const wait = () => (api() ? resolve(api()) : setTimeout(wait, 200));
    wait();
  });

  let ws;
  let timer;
  let delay = 1000;
  let state = "off";
  const connect = () => {
    clearTimeout(timer);
    ws?.close();
    if (!session || session.expires < Date.now()) return setState("off");
    const socket = (ws = new WebSocket(session.tab));
    setState("connecting");
    socket.onopen = () => { delay = 1000; setState("on"); };
    socket.onclose = (e) => {
      if (ws !== socket) return;
      if (e.code === 4000) return setState("replaced");
      setState("connecting");
      timer = setTimeout(connect, delay);
      delay = Math.min(delay * 2, 30000);
    };
    socket.onmessage = async ({ data }) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      const request = await ready;
      const reply = await request(msg.method, msg.params ?? {}).catch((e) => ({ ok: false, error: String(e) }));
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ ...reply, id: msg.id ?? null }));
    };
  };
  const disconnect = () => {
    session = null;
    save(null);
    const socket = ws;
    ws = null;
    socket?.close();
    clearTimeout(timer);
    setState("off");
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && session && (!ws || ws.readyState === WebSocket.CLOSED)) {
      delay = 1000;
      connect();
    }
  });

  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
      .fab { position: fixed; right: 12px; bottom: 12px; z-index: 2147483000; display: flex; align-items: center; gap: 6px;
        padding: 6px 10px; border-radius: 999px; border: 1px solid #3a3a3a; background: #232323ee; color: #e3e3e3; cursor: pointer;
        box-shadow: 0 2px 10px #0006; }
      .fab:hover { background: #2d2d2d; }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #777; }
      .on .dot { background: #3c3; } .connecting .dot { background: #e0a000; } .replaced .dot, .expired .dot { background: #c33; }
      .panel { position: fixed; right: 12px; bottom: 52px; z-index: 2147483000; width: min(340px, calc(100vw - 24px)); padding: 14px;
        border-radius: 10px; border: 1px solid #3a3a3a; background: #232323; color: #e3e3e3; box-shadow: 0 8px 30px #0008; }
      .panel[hidden] { display: none; }
      h2 { margin: 0 0 2px; font-size: 14px; font-weight: 600; }
      .muted { color: #9a9a9a; font-size: 12px; }
      .row { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
      button, select { border: 1px solid #3a3a3a; border-radius: 6px; background: #2c2c2c; color: inherit; padding: 6px 10px; cursor: pointer; }
      button:hover:not(:disabled) { background: #353535; }
      button.primary { background: #2d8ceb; border-color: #2d8ceb; color: #fff; }
      button.primary:hover { background: #4aa0f5; }
      button:disabled { opacity: .5; cursor: default; }
      .clients { display: grid; gap: 6px; margin-top: 12px; }
      .client { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border: 1px solid #333; border-radius: 8px; }
      .client.off { opacity: .5; }
      input { flex: 1; min-width: 0; border: 1px solid #3a3a3a; border-radius: 6px; background: #1b1b1b; color: #cfcfcf; padding: 6px 8px; font-family: ui-monospace, monospace; font-size: 11px; }
      .err { color: #f07070; margin-top: 8px; }
      .links { display: flex; justify-content: space-between; margin-top: 12px; }
      .link { background: none; border: none; padding: 0; color: #9a9a9a; text-decoration: underline; }
    </style>
    <button class="fab" part="fab" aria-expanded="false" aria-controls="panel"><span class="dot"></span><span>AI assistant</span></button>
    <div class="panel" id="panel" role="dialog" aria-label="AI assistant" hidden></div>`;
  const fab = root.querySelector(".fab");
  const panel = root.querySelector(".panel");
  fab.onclick = () => {
    panel.hidden = !panel.hidden;
    fab.setAttribute("aria-expanded", String(!panel.hidden));
    render();
  };
  // craft-hub's overlay draws the assistant itself.
  if (!window.craftHub) document.addEventListener("DOMContentLoaded", () => document.body.append(host));

  const STATUS = { off: "Not connected", connecting: "Connecting…", on: "Connected", replaced: "In use in another tab", expired: "Connection expired" };
  const listeners = new Set();
  function setState(s) {
    state = session && session.expires < Date.now() ? "expired" : s;
    for (const f of [...listeners]) f(state);
    fab.className = `fab ${state}`;
    fab.title = `AI assistant: ${STATUS[state]}`;
    if (!panel.hidden) render();
  }

  const until = (t) => {
    const h = Math.round((t - Date.now()) / 3600000);
    return h >= 48 ? `${Math.round(h / 24)} days` : h >= 1 ? `${h} hours` : "less than an hour";
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

  let error = "";
  async function openSession(hours) {
    const r = await fetch(`_assistant/session?app=${app}&hours=${hours}`, { method: "POST", credentials: "same-origin" });
    if (!r.ok) throw new Error(`the server answered ${r.status}`);
    session = await r.json();
    save(session);
    connect();
    return session;
  }
  async function create(hours) {
    error = "";
    try {
      await openSession(hours);
    } catch (e) {
      error = `Couldn't create a connection: ${e.message}`;
    }
    render();
  }

  function render() {
    if (panel.hidden) return;
    if (!session || state === "expired") {
      panel.innerHTML = `
        <h2>AI assistant</h2>
        <div class="muted">Let an AI assistant work in this ${esc(title)} tab. The work runs here, on this device.</div>
        <div class="row">
          <select aria-label="Connection lasts"><option value="24">For 1 day</option><option value="168" selected>For 7 days</option><option value="720">For 30 days</option></select>
          <button class="primary">${state === "expired" ? "Reconnect" : "Connect"}</button>
        </div>
        ${error ? `<div class="err">${esc(error)}</div>` : ""}`;
      panel.querySelector(".primary").onclick = () => create(panel.querySelector("select").value);
      return;
    }
    // One name per tab, so Claude Code can drive several tabs (and apps) at once.
    const cmd = `claude mcp add --transport http ${app}-${session.mcp.split("/").at(-3).split(".")[1].slice(0, 6).toLowerCase()} ${session.mcp}`;
    const claude = `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(title)}&connectorUrl=${encodeURIComponent(session.mcp)}`;
    panel.innerHTML = `
      <h2>AI assistant</h2>
      <div class="muted">${STATUS[state]} · expires in ${until(session.expires)}. Keep this tab open while the assistant works.</div>
      <div class="clients">
        <div class="client"><span>Claude</span><button class="primary" data-open="${esc(claude)}">Add to Claude</button></div>
        <div class="client"><span>Claude Code</span><button data-copy-cmd="${esc(cmd)}">Copy command</button></div>
        <div class="client off" aria-disabled="true"><span>ChatGPT</span><button disabled>Coming soon</button></div>
        <div class="client off" aria-disabled="true"><span>Gemini</span><button disabled>Coming soon</button></div>
      </div>
      <div class="muted" style="margin-top:12px">Server URL, for any MCP client. Anyone with it can use this tab, so share it with no one.</div>
      <div class="row"><input readonly value="${esc(session.mcp)}" aria-label="MCP server URL"><button data-copy>Copy</button></div>
      <div class="links"><button class="link" data-new>New URL</button><button class="link" data-off>Disconnect</button></div>`;
    panel.querySelector("[data-open]").onclick = (e) => window.open(e.currentTarget.dataset.open, "_blank", "noopener");
    panel.querySelector("[data-copy-cmd]").onclick = async (e) => {
      try { await navigator.clipboard.writeText(e.currentTarget.dataset.copyCmd); e.currentTarget.textContent = "Copied"; } catch { e.currentTarget.textContent = "Copy failed"; }
    };
    panel.querySelector("[data-copy]").onclick = async (e) => {
      const input = panel.querySelector("input");
      try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand("copy"); }
      e.currentTarget.textContent = "Copied";
    };
    panel.querySelector("[data-new]").onclick = () => { disconnect(); render(); };
    panel.querySelector("[data-off]").onclick = () => { disconnect(); panel.hidden = true; fab.setAttribute("aria-expanded", "false"); };
  }

  window.craftAssistant = {
    app,
    title,
    get state() { return state; },
    // The live connection ({ tab, mcp, expires }), or null.
    get session() { return session && session.expires >= Date.now() ? session : null; },
    connect: (hours = 168) => openSession(hours),
    // Reconnect a tab that another tab took over.
    reconnect: () => { delay = 1000; connect(); },
    disconnect,
    onChange: (f) => { listeners.add(f); return () => listeners.delete(f); },
  };

  // egui handles keys and pointers on the whole page; keep them inside the panel.
  for (const type of ["keydown", "keyup", "pointerdown", "wheel"]) host.addEventListener(type, (e) => e.stopPropagation());
  connect();
})();
