// An editor that frames this page, such as an editor extension that shows the app in a panel and
// lets a coding agent in the editor drive it. The page and the editor talk with postMessage: only
// this page and its direct parent, and only when the parent's origin is allowed. The allowed
// origins are the container's EMBED_ORIGINS, which craft-start.sh writes to _embed/config.json;
// nothing is allowed without them.
//
//   editor -> page  {type: "craft-embed:hello", files, session}
//       files: {label, name, readOnly} lends the editor's workspace (below), or null.
//       session: {tab, mcp, expires}, a relay connection for the agent (craft-remote.js), or null.
//       Without one, the editor still lends its files, but no agent drives the app.
//   page -> editor  {type: "craft-embed:session", app, title, state, mcp, expires, files, error}
//       the answer, and again whenever the relay connection changes. The editor gives the MCP URL
//       to its agent.
//   page -> editor  {type: "craft-embed:refused", app, origin}  the parent's origin isn't allowed.
//   page -> editor  {type: "craft-embed:files", id, op, ...}  a request for a workspace file
//   editor -> page  {type: "craft-embed:files-reply", id, ok, value | error}  and its answer.
//   editor -> page  {type: "craft-embed:open-files", files: [{name, type, bytes}]}  files to open.
(() => {
  if (window.parent === window) return;
  const app = document.currentScript.dataset.app;
  const A = window.craftAssistant;
  if (!A) return;
  const parent = window.parent;

  // https://*.code.example.com: a * stands for one or more host labels.
  const pattern = (p) => new RegExp(`^${String(p).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9.-]+")}$`, "i");
  const config = fetch("_embed/config.json", { cache: "no-store", credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((c) => ({
      allowed: (Array.isArray(c?.origins) ? c.origins : []).map(pattern),
      files: c?.files !== false,
    }));

  let origin = null; // the parent's origin, once its hello is accepted
  let filesOn = true;
  let error = "";
  let joining = null;

  const tell = () => {
    if (!origin) return;
    const s = A.session;
    const about = { app, title: A.title, state: A.state, mcp: s?.mcp ?? null, expires: s?.expires ?? null, files: filesOn, ...(error ? { error } : {}) };
    parent.postMessage({ type: "craft-embed:session", ...about }, origin);
  };
  A.onChange(() => {
    if (A.state === "on") error = "";
    tell();
  });

  async function join(session) {
    error = "";
    try {
      if (session) A.use(session);
      else if (A.state === "replaced") A.reconnect();
    } catch (e) {
      error = `${A.title} couldn't connect to the relay: ${e?.message ?? e}`;
      tell();
    }
  }

  window.addEventListener("message", async (e) => {
    if (e.source !== parent || typeof e.data?.type !== "string") return;
    const { type } = e.data;
    if (origin && e.origin === origin) {
      if (type === "craft-embed:files-reply") return answered(e.data);
      if (type === "craft-embed:open-files") return openFiles(e.data.files);
    }
    if (type !== "craft-embed:hello") return;
    const { allowed, files } = await config;
    if (!allowed.some((re) => re.test(e.origin))) {
      parent.postMessage({ type: "craft-embed:refused", app, origin: e.origin }, e.origin);
      return;
    }
    origin = e.origin;
    filesOn = files;
    lend(files ? e.data.files : null);
    const session = e.data.session && typeof e.data.session === "object" ? e.data.session : null;
    const needed = session ? A.session?.tab !== session.tab : A.state === "replaced";
    if (needed && !joining) joining = join(session).finally(() => { joining = null; });
    tell();
  });

  // ---- the editor's workspace ------------------------------------------------------------------
  // A hello with `files` lends the editor's workspace:
  //  - a place in the app's File › Open and Save dialogs. craft-storage.js lists
  //    window.craftStoragePlaces; paths are cloud:workspace/<path>.
  //  - files the AI assistant opens and saves by path (craft-storage.js asks the place to locate
  //    the path).
  //  - files dragged from the editor's explorer onto the app. The drag carries only file URIs; the
  //    editor reads the files, and the page replays them as an ordinary file drop on the app.
  // Requests go to the parent on its checked origin, and only its replies are heard. Call ids are
  // random, so another frame that posts to the editor can't answer in the editor's place.
  const PLACE = "workspace";
  let lending = false;
  const calls = new Map(); // id -> { resolve, reject, timer }
  const newId = () => crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  function ask(op, args = {}) {
    return new Promise((resolve, reject) => {
      if (!lending) return reject(new Error("The editor isn't sharing its files."));
      const id = newId();
      const timer = setTimeout(() => { calls.delete(id); reject(new Error("The editor didn't answer.")); }, 120_000);
      calls.set(id, { resolve, reject, timer });
      parent.postMessage({ type: "craft-embed:files", id, op, ...args }, origin);
    });
  }
  function answered(m) {
    const call = calls.get(m.id);
    if (!call) return;
    calls.delete(m.id);
    clearTimeout(call.timer);
    m.ok ? call.resolve(m.value) : call.reject(new Error(String(m.error ?? "The editor refused.")));
  }
  function lend(files) {
    const places = (window.craftStoragePlaces ?? []).filter((p) => p.id !== PLACE);
    if (!files || typeof files !== "object") {
      if (!lending) return;
      lending = false;
      window.craftStoragePlaces = places;
      for (const [id, call] of calls) { clearTimeout(call.timer); call.reject(new Error("The editor stopped sharing its files.")); calls.delete(id); }
      return;
    }
    lending = true;
    window.craftStoragePlaces = [...places, {
      id: PLACE, group: String(files.label || "Editor").slice(0, 40), name: String(files.name || "Workspace").slice(0, 80),
      readOnly: files.readOnly === true,
      list: (path) => ask("list", { path }),
      read: (path) => ask("read", { path }),
      write: (path, bytes) => ask("write", { path, bytes }),
      mkdir: (path) => ask("mkdir", { path }),
      // An AI assistant's file system path (/home/coder/project/cat.png) to this place's path.
      locate: (path) => ask("place", { path }),
    }];
  }

  // ---- host mode: the app's saves go to the workspace ------------------------------------------
  // The apps built on craft-web-host (storytold/craft-libs) hand every file they would download to
  // the page when their canvas has data-host="page": `<app>:save` {name, saveAs, bytes, id?} as an
  // event on the canvas. The page takes files in with `<app>:open` {name, bytes} and confirms a
  // save with `<app>:saved` {id}. In an editor, the page writes each save into the workspace:
  //  - a Save of the document's own file (saveAs false, the same name) goes back to the file the
  //    document came from, with no question;
  //  - anything else (Save As, an export, a new document) asks the editor's save dialog where to
  //    put it, starting in the document's folder. Cancel leaves the document unsaved.
  // While an agent request runs, no dialog opens: the file is kept for the agent instead
  // (craft_app_files), as a download would be. Without the editor's files, a save downloads.
  const HOST_APPS = new Set(["wordcraft", "gridcraft", "deckcraft"]);
  let canvas = null;
  let appReady = false;
  const pending = []; // files to open once the app listens
  let doc = null; // {name, path}: the workspace file of the document, as the app names it
  const hostOpen = (name, bytes, path) => {
    if (!appReady) return pending.push([name, bytes, path]);
    const buf = bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes).slice().buffer;
    canvas.dispatchEvent(new CustomEvent(`${app}:open`, { detail: { name, bytes: buf } }));
    doc = path ? { name, path } : null;
  };
  const download = (name, blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click(); // craft-files.js keeps a copy for the agent
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  };
  async function hostSave({ name, saveAs, bytes, id }) {
    name = String(name ?? "").split(/[\\/]/).pop() || "Untitled";
    const blob = new Blob([bytes]);
    const saved = () => { if (id != null) canvas.dispatchEvent(new CustomEvent(`${app}:saved`, { detail: { id } })); };
    if (!lending) return download(name, blob), saved();
    window.craftFiles?.keep(name, blob);
    const own = !saveAs && doc && doc.name === name;
    if (!own && window.craftFiles?.quiet()) return saved();
    try {
      const path = own ? doc.path : await ask("saveAs", { name, near: doc?.path ?? "" });
      if (!path) return; // the person cancelled: the document stays unsaved
      await ask("write", { path, bytes: new Uint8Array(bytes) });
      if (saveAs || !doc) doc = { name, path };
      saved();
    } catch (e) {
      console.warn(`craft-embed: ${name} wasn't saved: ${e?.message ?? e}`);
      canvas.dispatchEvent(new CustomEvent(`${app}:failed`, { detail: { error: String(e?.message ?? e), id } }));
    }
  }
  if (HOST_APPS.has(app)) {
    // The app reads data-host when it starts, after the page is parsed.
    const attach = () => {
      if (canvas || document.readyState === "loading") return;
      canvas = document.getElementById(`${app}_canvas`);
      if (!canvas) return;
      canvas.dataset.host = "page";
      canvas.addEventListener(`${app}:ready`, () => {
        appReady = true;
        for (const f of pending.splice(0)) hostOpen(...f);
      });
      canvas.addEventListener(`${app}:save`, (e) => { hostSave(e.detail ?? {}); });
    };
    attach();
    document.addEventListener("readystatechange", attach);
  }

  // Files the editor hands over (dropped on its apps list, or "Open in a Craft App"): the app gets
  // each one as craft-files.js hands it files from the agent, or with `<app>:open` in host mode.
  async function openFiles(files) {
    if (!Array.isArray(files)) return;
    for (const f of files) {
      if (!f?.bytes || !f.name) continue;
      if (canvas) {
        hostOpen(String(f.name), f.bytes, typeof f.path === "string" ? f.path : null);
        continue;
      }
      try {
        await window.craftFiles.give(new File([f.bytes], String(f.name), { type: f.type || "" }));
      } catch (e) {
        console.warn(`craft-embed: ${f.name} didn't open: ${e?.message ?? e}`);
      }
    }
  }

  // Drops from the editor's explorer. A drop of real files (from the desktop) has "Files" and is
  // left to the app.
  // VS Code's own types come first: Chromium turns file: links in text/uri-list into
  // about:blank#blocked for web content, while code-server's vscode-remote: links pass.
  const URI_TYPES = ["application/vnd.code.uri-list", "resourceurls", "text/uri-list"];
  const editorDrag = (e) => {
    if (!lending || !e.isTrusted) return false;
    const types = [...(e.dataTransfer?.types ?? [])].map((t) => t.toLowerCase());
    return !types.includes("files") && URI_TYPES.some((t) => types.includes(t));
  };
  function droppedUris(dt) {
    const usable = (s) => s && !s.startsWith("#") && !s.startsWith("about:");
    const lines = (t) => (dt.getData(t) || "").split(/\r?\n/).map((s) => s.trim()).filter(usable);
    const json = (t) => { try { const v = JSON.parse(dt.getData(t) || "null"); return Array.isArray(v) ? v.map(String).filter(usable) : []; } catch { return []; } };
    for (const list of [() => lines("application/vnd.code.uri-list"), () => json("ResourceURLs"), () => lines("text/uri-list")]) {
      const uris = list();
      if (uris.length) return uris.slice(0, 50);
    }
    return [];
  }
  window.addEventListener("dragover", (e) => {
    if (!editorDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, true);
  window.addEventListener("drop", async (e) => {
    if (!editorDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const { target, clientX, clientY } = e;
    const on = target instanceof Element && target.isConnected ? target : document.querySelector("canvas") ?? document.body;
    const send = (type, dataTransfer = new DataTransfer()) =>
      on.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, clientX, clientY, dataTransfer }));
    // The app saw the real dragenter and dragover; when nothing gets dropped, end its drag state.
    const uris = droppedUris(e.dataTransfer);
    if (!uris.length) return send("dragleave");
    try {
      const { files } = await ask("drop", { uris });
      if (!files?.length) return send("dragleave");
      if (canvas) {
        send("dragleave");
        for (const f of files) hostOpen(f.name, f.bytes, f.path);
        return;
      }
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(new File([f.bytes], f.name, { type: f.type || "" }));
      for (const type of ["dragenter", "dragover", "drop"]) send(type, dt);
    } catch (err) {
      send("dragleave");
      console.warn(`craft-embed: the dropped files didn't arrive: ${err.message}`);
    }
  }, true);
})();
