// Storage places for File › Open and Save: `window.craftStorage`, used by the app (storage.rs).
// Whoever hosts or frames the page lends the places through window.craftStoragePlaces: an editor
// that frames the page lends its workspace (craft-embed.js), and a page that serves the app can add
// its own storage. Without places, the app keeps its own dialogs. A place is
// {id, group, name, readOnly, list(path) -> {folders, files: [{name, size, modified}]},
// read(path) -> bytes, write(path, bytes), mkdir(path), locate(path)?}, and its files get the
// paths cloud:<place id>/<path>.
(() => {
  const LAST = "craftStorage.last";

  const split = (cloudPath) => {
    const [root, ...rest] = cloudPath.slice("cloud:".length).split("/");
    return { root, path: rest.join("/") };
  };
  // Places lent by the page; read on every use, since the editor may come and go.
  const places = () => (Array.isArray(window.craftStoragePlaces) ? window.craftStoragePlaces : [])
    .filter((p) => p && typeof p.id === "string" && /^[a-z0-9_-]+$/i.test(p.id) && typeof p.list === "function")
    .map((p) => (seenPlaces.add(p.id), p));
  const placeOf = (id) => places().find((p) => p.id === id);
  const seenPlaces = new Set(); // ids of every place this page has lent so far
  const toBytes = (v) => v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v)
    : ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : null;
  const listing = (v) => ({
    folders: (Array.isArray(v?.folders) ? v.folders : []).map(String),
    files: (Array.isArray(v?.files) ? v.files : []).map((f) => ({ name: String(f.name), size: Number(f.size) || 0, modified: f.modified ?? 0 })),
  });
  const ext = (name) => (name.match(/\.([^./]+)$/)?.[1] ?? "").toLowerCase();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const size = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const when = (d) => new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    :host { all: initial; }
    * { box-sizing: border-box; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
    .scrim { position: fixed; inset: 0; z-index: 2147483100; background: #0008; display: flex; align-items: center; justify-content: center; }
    .dialog { width: min(760px, calc(100vw - 24px)); height: min(520px, calc(100vh - 24px)); display: grid; grid-template-rows: auto 1fr auto;
      background: #232323; color: #e3e3e3; border: 1px solid #3a3a3a; border-radius: 10px; box-shadow: 0 12px 40px #000a; overflow: hidden; }
    header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid #333; }
    h2 { margin: 0; font-size: 15px; font-weight: 600; }
    .body { display: grid; grid-template-columns: 180px 1fr; min-height: 0; }
    nav { border-right: 1px solid #333; padding: 8px; display: flex; flex-direction: column; gap: 2px; overflow: auto; }
    nav .label { color: #8a8a8a; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; margin: 8px 6px 4px; }
    nav button { text-align: left; border: 0; background: none; color: inherit; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
    nav button:hover { background: #2e2e2e; } nav button.on { background: #2d8ceb33; color: #fff; }
    .main { display: grid; grid-template-rows: auto 1fr; min-height: 0; }
    .bar { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid #333; }
    .crumbs { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .crumbs button { border: 0; background: none; color: #9fc6f5; padding: 2px 3px; cursor: pointer; }
    .crumbs span { color: #777; }
    .list { overflow: auto; }
    .item { display: grid; grid-template-columns: 22px 1fr 80px 150px; gap: 8px; align-items: center; padding: 6px 12px; cursor: default; user-select: none; }
    .item:hover { background: #2a2a2a; } .item.sel { background: #2d8ceb44; } .item.dim { opacity: .45; }
    .item .n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .item .m { color: #8a8a8a; font-size: 12px; }
    .empty, .center { padding: 40px 16px; text-align: center; color: #9a9a9a; }
    footer { display: flex; gap: 8px; align-items: center; padding: 10px 14px; border-top: 1px solid #333; }
    footer .grow { flex: 1; }
    input { border: 1px solid #3a3a3a; border-radius: 6px; background: #1b1b1b; color: #e3e3e3; padding: 6px 8px; }
    input.name { flex: 1; min-width: 0; }
    button.b { border: 1px solid #3a3a3a; border-radius: 6px; background: #2c2c2c; color: inherit; padding: 6px 12px; cursor: pointer; }
    button.b:hover:not(:disabled) { background: #353535; } button.b:disabled { opacity: .5; cursor: default; }
    button.primary { background: #2d8ceb; border-color: #2d8ceb; color: #fff; } button.primary:hover:not(:disabled) { background: #4aa0f5; }
    .x { border: 0; background: none; color: #aaa; font-size: 18px; cursor: pointer; }
    .err { color: #f07070; } .who { color: #8a8a8a; font-size: 12px; }
    .link { border: 0; background: none; color: #9a9a9a; text-decoration: underline; cursor: pointer; padding: 0; font-size: 12px; }
    .toast { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 2147483200; padding: 8px 14px; border-radius: 8px;
      background: #2c2c2c; color: #e3e3e3; border: 1px solid #3a3a3a; box-shadow: 0 4px 16px #0008; }
    .toast.bad { border-color: #c33; }
    @media (max-width: 560px) { .body { grid-template-columns: 1fr; } nav { flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1px solid #333; }
      nav .label { display: none; } .item { grid-template-columns: 22px 1fr 70px; } .item .d { display: none; } }
  </style><div class="toast" hidden></div>`;
  for (const type of ["keydown", "keyup", "keypress", "pointerdown", "pointerup", "wheel", "paste", "copy", "cut"]) host.addEventListener(type, (e) => e.stopPropagation());
  document.addEventListener("DOMContentLoaded", () => document.body.append(host));

  let toastTimer;
  const toast = (text, bad = false, sticky = false) => {
    const t = root.querySelector(".toast");
    t.textContent = text;
    t.className = `toast${bad ? " bad" : ""}`;
    t.hidden = false;
    clearTimeout(toastTimer);
    if (!sticky) toastTimer = setTimeout(() => (t.hidden = true), bad ? 6000 : 2500);
  };

  // The dialog: mode "open" (resolves {path, bytes}) or "save" (resolves a cloud path).
  function dialog(mode, { exts, suggested }) {
    return new Promise((resolve) => {
      const last = (() => { try { return JSON.parse(localStorage.getItem(LAST)) ?? {}; } catch { return {}; } })();
      const from = suggested?.startsWith("cloud:") && split(suggested);
      let rootId = from ? from.root : last.root;
      let path = from ? from.path.split("/").slice(0, -1).join("/") : last.path ?? "";
      let entries = { folders: [], files: [] };
      let selected = null;
      let filter = "";
      let error = "";
      let busy = false;
      let confirmOverwrite = null;
      const scrim = document.createElement("div");
      scrim.className = "scrim";
      root.append(scrim);
      const close = (value) => {
        scrim.remove();
        document.removeEventListener("keydown", onKey, true);
        if (rootId) try { localStorage.setItem(LAST, JSON.stringify({ root: rootId, path })); } catch {}
        resolve(value);
      };
      const onKey = (e) => { if (e.key === "Escape" && document.activeElement !== null) { e.stopPropagation(); close(null); } };
      document.addEventListener("keydown", onKey, true);
      scrim.addEventListener("pointerdown", (e) => { if (e.target === scrim) close(null); });

      const roots = () => places().map((p) => ({ id: p.id, name: p.name, group: p.group, readOnly: p.readOnly === true, place: p }));
      const rootOf = () => roots().find((r) => r.id === rootId);
      const openable = (name) => !exts?.length || exts.includes(ext(name));

      // Each load is numbered; a slower answer for a folder the person already left is dropped.
      let loads = 0;
      async function load() {
        if (!rootOf()) { rootId = roots()[0]?.id; path = rootOf() ? path : ""; }
        if (!rootId) return render();
        const mine = ++loads;
        busy = true; error = ""; selected = null; confirmOverwrite = null; render();
        let found;
        try {
          found = listing(await rootOf().place.list(path));
        } catch (e) {
          if (mine !== loads) return;
          if (path) { path = ""; busy = false; return load(); }
          error = e.message; found = { folders: [], files: [] };
        }
        if (mine !== loads) return;
        entries = found;
        busy = false;
        render();
      }

      async function openFile(name) {
        busy = true; render();
        try {
          const full = [path, name].filter(Boolean).join("/");
          const bytes = toBytes(await rootOf().place.read(full));
          if (!bytes) throw new Error("no file came back");
          close({ path: `cloud:${rootId}/${full}`, bytes });
        } catch (e) { busy = false; error = `Couldn't open ${name}: ${e.message}`; render(); }
      }

      function saveAs() {
        const name = scrim.querySelector("input.name").value.trim();
        if (!name || /[/\\]/.test(name)) { error = "Enter a file name without slashes."; return render(); }
        if (entries.files.some((f) => f.name === name) && confirmOverwrite !== name) { confirmOverwrite = name; return render(); }
        close(`cloud:${rootId}/${[path, name].filter(Boolean).join("/")}`);
      }

      async function newFolder() {
        const name = prompt("Folder name");
        if (!name?.trim() || /[/\\]/.test(name)) return;
        const full = [path, name.trim()].filter(Boolean).join("/");
        try { await rootOf().place.mkdir(full); path = [path, name.trim()].filter(Boolean).join("/"); load(); }
        catch (e) { error = e.message; render(); }
      }

      function render() {
        const r = rootOf();
        const usable = Boolean(r);
        const groups = [...new Set(places().map((p) => p.group || "Other places"))];
        const button = (x) => `<button data-root="${esc(x.id)}" class="${x.id === rootId ? "on" : ""}">${esc(x.name)}${x.readOnly ? " (read-only)" : ""}</button>`;
        const crumbs = r ? [`<button data-crumb="">${esc(r.name)}</button>`, ...path.split("/").filter(Boolean).map((p, i, a) =>
          `<span>›</span><button data-crumb="${esc(a.slice(0, i + 1).join("/"))}">${esc(p)}</button>`)].join("") : "";
        const match = (n) => n.toLowerCase().includes(filter.toLowerCase());
        const folders = entries.folders.filter(match);
        const files = entries.files.filter((f) => match(f.name));
        const name = scrim.querySelector("input.name")?.value ?? suggested?.split("/").pop() ?? "";
        scrim.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-label="${mode === "open" ? "Open" : "Save as"}">
          <header><h2>${mode === "open" ? "Open" : "Save as"}</h2><button class="x" aria-label="Close" data-close>×</button></header>
          <div class="body">
            <nav aria-label="Locations">
              ${groups.map((g) => `<div class="label">${esc(g)}</div>${roots().filter((x) => x.place && (x.group || "Other places") === g).map(button).join("")}`).join("")}
              <div class="label">Other</div>
              <button data-device>This device…</button>
            </nav>
            <div class="main">
              ${usable ? `<div class="bar"><div class="crumbs">${crumbs}</div><input type="search" placeholder="Filter" aria-label="Filter" value="${esc(filter)}">
                ${r.readOnly ? "" : `<button class="b" data-mkdir>New folder</button>`}</div>` : "<div></div>"}
              <div class="list" role="listbox" aria-label="Files">
                ${!r ? `<div class="empty">No places are available.</div>`
                  : busy ? `<div class="empty">Loading…</div>`
                  : !folders.length && !files.length ? `<div class="empty">${filter ? "Nothing matches." : "This folder is empty."}</div>`
                  : folders.map((f) => `<div class="item" role="option" data-folder="${esc(f)}"><span>📁</span><span class="n">${esc(f)}</span><span class="m"></span><span class="m d"></span></div>`).join("") +
                    files.map((f) => `<div class="item${mode === "open" && !openable(f.name) ? " dim" : ""}${selected === f.name ? " sel" : ""}" role="option" data-file="${esc(f.name)}">
                      <span>📄</span><span class="n">${esc(f.name)}</span><span class="m">${size(f.size)}</span><span class="m d">${when(f.modified)}</span></div>`).join("")}
              </div>
            </div>
          </div>
          <footer>
            ${mode === "save" && usable ? `<input class="name" aria-label="File name" value="${esc(name)}">` : `<span class="grow ${error ? "err" : "who"}">${esc(error)}</span>`}
            ${mode === "save" && error ? `<span class="err">${esc(error)}</span>` : ""}
            ${confirmOverwrite ? `<span class="err">Replace ${esc(confirmOverwrite)}?</span>` : ""}
            <button class="b" data-close>Cancel</button>
            ${mode === "open"
              ? `<button class="b primary" data-open ${selected && openable(selected) && !busy ? "" : "disabled"}>Open</button>`
              : `<button class="b primary" data-save ${usable && !r.readOnly && !busy ? "" : "disabled"}>${confirmOverwrite ? "Replace" : "Save"}</button>`}
          </footer></div>`;
        const on = (sel, ev, fn) => scrim.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));
        on("[data-close]", "click", () => close(null));
        on("[data-device]", "click", () => close("device"));
        on("[data-root]", "click", (e) => { rootId = e.currentTarget.dataset.root; path = ""; load(); });
        on("[data-crumb]", "click", (e) => { path = e.currentTarget.dataset.crumb; load(); });
        on("[data-folder]", "dblclick", (e) => { path = [path, e.currentTarget.dataset.folder].filter(Boolean).join("/"); load(); });
        on("[data-folder]", "click", (e) => { if (matchMedia("(pointer: coarse)").matches) { path = [path, e.currentTarget.dataset.folder].filter(Boolean).join("/"); load(); } });
        on("[data-file]", "click", (e) => {
          selected = e.currentTarget.dataset.file;
          if (mode === "save") { scrim.querySelector("input.name").value = selected; confirmOverwrite = null; }
          render();
        });
        on("[data-file]", "dblclick", (e) => mode === "open" ? openable(e.currentTarget.dataset.file) && openFile(e.currentTarget.dataset.file) : saveAs());
        on("[data-open]", "click", () => openFile(selected));
        on("[data-save]", "click", saveAs);
        on("[data-mkdir]", "click", newFolder);
        on("input[type=search]", "input", (e) => { filter = e.target.value; const pos = e.target.selectionStart; render(); const s = scrim.querySelector("input[type=search]"); s.focus(); s.setSelectionRange(pos, pos); });
        on("input.name", "keydown", (e) => { if (e.key === "Enter") saveAs(); });
        on("input.name", "input", () => { confirmOverwrite = null; });
        if (mode === "save") {
          const input = scrim.querySelector("input.name");
          if (input && document.activeElement !== host) { input.focus(); const dot = input.value.lastIndexOf("."); input.setSelectionRange(0, dot > 0 ? dot : input.value.length); }
        }
      }
      load();
    });
  }

  window.craftStorage = {
    // undefined: the app shows its own dialog.
    async chooseOpen(exts) {
      if (!places().length) return "device";
      return dialog("open", { exts: exts ?? null });
    },
    async chooseSave(suggested) {
      if (!places().length) return "device";
      // The AI assistant saved (craft-files.js): no dialog it can't answer. The download stays in
      // the page, for the editor to copy into its workspace.
      if (window.craftFiles?.quiet()) return "device";
      return dialog("save", { suggested });
    },
    async write(cloudPath, bytes) {
      const { root: r, path } = split(cloudPath);
      const name = path.split("/").pop();
      const place = placeOf(r);
      // A place's file while the place is gone (the editor isn't connected now).
      if (!place) {
        const e = new Error(`${name} isn't saved: its place isn't available now${seenPlaces.has(r) ? " (is the editor connected?)" : ""}.`);
        toast(e.message, true, true);
        setTimeout(() => (root.querySelector(".toast").hidden = true), 10000);
        throw e;
      }
      toast(`Saving ${name} to ${place.name}…`, false, true);
      try {
        await place.write(path, bytes);
        toast(`Saved ${name} to ${place.name}`);
      } catch (e) {
        toast(`Couldn't save ${name}: ${e.message}`, true, true);
        setTimeout(() => (root.querySelector(".toast").hidden = true), 10000);
        // The app keeps the document unsaved only when the write rejects.
        throw e;
      }
    },

    // ---- files for the AI assistant (craft-remote.js and the app's storage.rs) ----------------
    // The assistant names files by path: a path in the editor's workspace as the editor's machine
    // sees it (/home/coder/project/cat.png), or a cloud:<place id>/ path. craft-remote.js calls
    // automationPrepare before a request that names a file; the app then calls automationRead and
    // automationWrite, which must answer at once; craft-remote.js awaits automationSettle after.
    async automationPrepare(path, { read = false } = {}) {
      let target;
      try {
        target = await whereIs(path);
      } catch (e) {
        // Not a workspace file, in a page the editor frames: the write stays in the page
        // (craft-files.js), and the editor's craft_get_file copies it where the assistant says.
        if (read || !window.craftFiles?.framed()) throw e;
        keeping.add(path);
        return;
      }
      if (read) {
        const { root: r, path: inside } = split(target);
        const place = placeOf(r);
        if (!place) throw new Error(`${path} isn't reachable: its place isn't available now`);
        const bytes = toBytes(await place.read(inside));
        if (!bytes) throw new Error(`no file came back for ${path}`);
        readCache.set(path, { name: inside.split("/").pop() || path, bytes });
      }
    },
    automationRead(path) {
      const got = readCache.get(path);
      readCache.delete(path);
      return got ?? `${path} wasn't read first; ask again.`;
    },
    automationWrite(path, bytes) {
      if (keeping.has(path)) {
        window.craftFiles.keep(path, new Blob([bytes]));
        return null;
      }
      const target = aliases.get(path) ?? (path.startsWith("cloud:") ? path : null);
      if (!target) return `${path} can't be written here: name a file in the editor's workspace, or a cloud:<place id>/ path.`;
      pending.push(this.write(target, bytes).then(() => null, (e) => `Couldn't save ${path}: ${e.message}`));
      return null;
    },
    async automationSettle() {
      keeping.clear();
      const done = await Promise.all(pending.splice(0));
      return done.find(Boolean) ?? null;
    },
  };

  // Paths the assistant used, mapped to cloud: paths; reads waiting for the app; writes running.
  const aliases = new Map();
  const readCache = new Map();
  const pending = [];
  const keeping = new Set(); // paths outside the workspace whose writes stay in the page
  async function whereIs(path) {
    if (typeof path !== "string" || !path) throw new Error("pass a file path");
    if (aliases.has(path)) return aliases.get(path);
    let target = null;
    if (path.startsWith("cloud:")) target = path;
    else {
      const ws = places().find((p) => typeof p.locate === "function");
      if (!ws) {
        throw new Error(`${path} isn't reachable: this tab can open and save files only in the places its page lends, ` +
          "such as the workspace of an editor that frames the page, or by a cloud:<place id>/<path> path.");
      }
      target = `cloud:${ws.id}/${await ws.locate(path)}`;
    }
    aliases.set(path, target);
    return target;
  }
})();
