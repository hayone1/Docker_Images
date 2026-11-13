// Remote control: connects this tab to a craft-mcp relay, so an MCP client (an AI agent, a script)
// can drive the app in it. The page has no UI for this. A connection ({tab, mcp, expires}) comes
// from whoever hosts or frames the page:
//  - an editor that frames the page hands one over (craft-embed.js);
//  - a page that serves the app (a proxy, say) calls window.craftAssistant.use();
//  - a link opens the page once with ?relay=<the tab's wss URL>.
// window.craftAssistant exposes the connection and its state.
(() => {
  const app = document.currentScript.dataset.app;
  const title = { photocraft: "PhotoCraft", vectorcraft: "VectorCraft", lightcraft: "LightCraft", filmcraft: "FilmCraft", effectcraft: "EffectCraft" }[app] ?? app;
  // One origin can serve several apps, so the key names the app.
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

  // Requests that name a file (craft-storage.js keeps the files; the app's storage.rs asks it).
  // The app reads and writes at once, while craft-storage needs promises: read the file before
  // the request, and wait for the writes after it, so the reply says whether the file is saved.
  // Only photocraft's storage.rs answers the app's file requests so far.
  const FILE_METHODS = app === "photocraft" ? { "app.open": { read: true }, "app.save": {}, "ui.screenshot": {} } : {};
  const withFiles = async (method, params, request) => {
    const storage = window.craftStorage;
    if (!storage?.automationPrepare || !Object.hasOwn(FILE_METHODS, method)) return request(method, params);
    if (typeof params.path === "string" && params.path) {
      try { await storage.automationPrepare(params.path, FILE_METHODS[method]); }
      catch (e) { return { ok: false, error: String(e?.message ?? e) }; }
    }
    const reply = await request(method, params);
    const failed = await storage.automationSettle();
    return failed && reply?.ok ? { ok: false, error: failed } : reply;
  };

  // VectorCraft's export tool runs the engine's document.export, which has no file system in a
  // browser ("no file system here"). app.export encodes the same way with the same options and
  // writes through the page instead (a download, which craft-files.js keeps for the editor).
  const reroute = (method, params) =>
    app === "vectorcraft" && method === "engine.execute" && params?.command === "document.export" && typeof params.params?.path === "string"
      ? ["app.export", params.params]
      : [method, params];

  let ws;
  let timer;
  let delay = 1000;
  let state = "off";
  const listeners = new Set();
  function setState(s) {
    state = session && session.expires < Date.now() ? "expired" : s;
    for (const f of [...listeners]) f(state);
  }

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
      const params = msg.params ?? {};
      // craft.files: the editor's file transfers (craft-files.js), answered by the page itself.
      // Anything else goes to the app; craft-files.js keeps the files the request downloads.
      const files = window.craftFiles;
      const answer = msg.method === "craft.files"
        ? async () => {
          if (!files) return { ok: false, error: "this page can't take files from the editor" };
          return { ok: true, result: await files.handle(params) };
        }
        : async () => {
          const request = await ready;
          const run = () => withFiles(...reroute(msg.method, params), request);
          return files ? files.during(run) : run();
        };
      const reply = await answer().catch((e) => ({ ok: false, error: String(e?.message ?? e) }));
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

  window.craftAssistant = {
    app,
    title,
    get state() { return state; },
    // The live connection ({ tab, mcp, expires }), or null.
    get session() { return session && session.expires >= Date.now() ? session : null; },
    // Use a connection made elsewhere. keep: true also keeps it for the next visit of this page;
    // an editor that frames the page doesn't keep it, since each editor window makes its own.
    use(s, { keep = false } = {}) {
      const valid = s && typeof s.tab === "string" && /^wss?:\/\/.+\/tab\/[a-z0-9-]+$/.test(s.tab) && s.tab.endsWith(`/tab/${app}`)
        && typeof s.mcp === "string" && /^https?:\/\/.+\/mcp$/.test(s.mcp) && Number(s.expires) > Date.now();
      if (!valid) throw new Error("the relay connection isn't valid");
      const next = { tab: s.tab, mcp: s.mcp, expires: Number(s.expires) };
      if (keep) save(next);
      if (session?.tab === s.tab && ws && ws.readyState <= WebSocket.OPEN) return;
      session = next;
      delay = 1000;
      connect();
    },
    // Reconnect a tab that another tab took over.
    reconnect: () => { delay = 1000; connect(); },
    disconnect,
    onChange: (f) => { listeners.add(f); return () => listeners.delete(f); },
  };

  connect();
})();
