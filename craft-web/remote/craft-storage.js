// Cloud storage for File › Open and Save: `window.craftStorage`, used by the app (storage.rs).
// The server side is _storage/ next to the page (the site root, or craft-hub's /<app>/); without it configured the app keeps its own
// dialogs. Paths look like cloud:<folder id>/<path>.
(() => {
  const app = document.currentScript.dataset.app;
  const LAST = "craftStorage.last";
  const api = (action, params = {}, init) => fetch(`_storage/${action}?${new URLSearchParams(params)}`, { credentials: "same-origin", cache: "no-store", ...init });
  const getJson = async (action, params, init) => {
    const r = await api(action, params, init);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(body.error || `the server answered ${r.status}`), { status: r.status });
    return body;
  };
  let config;
  const loadConfig = async () => (config = await getJson("config").catch(() => ({ enabled: false })));
  const ready = loadConfig();

  const split = (cloudPath) => {
    const [root, ...rest] = cloudPath.slice("cloud:".length).split("/");
    return { root, path: rest.join("/") };
  };
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

  const signIn = () => new Promise((resolve) => {
    const w = window.open(`_storage/login`, "craft-sign-in", "width=520,height=680");
    const done = async (e) => {
      if (e.origin !== location.origin || e.data?.type !== "craft-storage-sign-in") return;
      window.removeEventListener("message", done);
      clearInterval(poll);
      await loadConfig();
      resolve(e.data.ok ? null : e.data.message);
    };
    window.addEventListener("message", done);
    const poll = setInterval(async () => {
      if (w && !w.closed) return;
      clearInterval(poll);
      window.removeEventListener("message", done);
      await loadConfig();
      resolve(config.user ? null : "");
    }, 800);
  });

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

      const roots = () => config.user?.roots ?? [];
      const rootOf = () => roots().find((r) => r.id === rootId);
      const openable = (name) => !exts?.length || exts.includes(ext(name));

      async function load() {
        if (!rootOf()) { rootId = roots()[0]?.id; path = rootOf() ? path : ""; }
        if (!rootId) return render();
        busy = true; error = ""; selected = null; confirmOverwrite = null; render();
        try {
          entries = await getJson("list", { root: rootId, path });
        } catch (e) {
          if (e.status === 401) { await loadConfig(); }
          else if (path) { path = ""; busy = false; return load(); }
          error = e.message; entries = { folders: [], files: [] };
        }
        busy = false;
        render();
      }

      async function openFile(name) {
        busy = true; render();
        try {
          const full = [path, name].filter(Boolean).join("/");
          const r = await api("file", { root: rootId, path: full });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `the server answered ${r.status}`);
          close({ path: `cloud:${rootId}/${full}`, bytes: new Uint8Array(await r.arrayBuffer()) });
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
        try { await getJson("folder", { root: rootId, path: [path, name.trim()].filter(Boolean).join("/") }, { method: "POST" }); path = [path, name.trim()].filter(Boolean).join("/"); load(); }
        catch (e) { error = e.message; render(); }
      }

      function render() {
        const r = rootOf();
        const signedIn = Boolean(config.user);
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
              <div class="label">${esc(config.name)}</div>
              ${signedIn ? roots().map((x) => `<button data-root="${esc(x.id)}" class="${x.id === rootId ? "on" : ""}">${esc(x.name)}${x.readOnly ? " (read-only)" : ""}</button>`).join("")
                : `<button data-signin>Sign in with ${esc(config.signIn)}</button>`}
              <div class="label">Other</div>
              <button data-device>This device…</button>
            </nav>
            <div class="main">
              ${signedIn && r ? `<div class="bar"><div class="crumbs">${crumbs}</div><input type="search" placeholder="Filter" aria-label="Filter" value="${esc(filter)}">
                ${r.readOnly ? "" : `<button class="b" data-mkdir>New folder</button>`}</div>` : "<div></div>"}
              <div class="list" role="listbox" aria-label="Files">
                ${!signedIn ? `<div class="center"><p>Sign in to open and save files in ${esc(config.name)}.</p><button class="b primary" data-signin>Sign in with ${esc(config.signIn)}</button></div>`
                  : !r ? `<div class="empty">No folders are shared with you yet.</div>`
                  : busy ? `<div class="empty">Loading…</div>`
                  : !folders.length && !files.length ? `<div class="empty">${filter ? "Nothing matches." : "This folder is empty."}</div>`
                  : folders.map((f) => `<div class="item" role="option" data-folder="${esc(f)}"><span>📁</span><span class="n">${esc(f)}</span><span class="m"></span><span class="m d"></span></div>`).join("") +
                    files.map((f) => `<div class="item${mode === "open" && !openable(f.name) ? " dim" : ""}${selected === f.name ? " sel" : ""}" role="option" data-file="${esc(f.name)}">
                      <span>📄</span><span class="n">${esc(f.name)}</span><span class="m">${size(f.size)}</span><span class="m d">${when(f.modified)}</span></div>`).join("")}
              </div>
            </div>
          </div>
          <footer>
            ${mode === "save" && signedIn && r ? `<input class="name" aria-label="File name" value="${esc(name)}">` : `<span class="grow ${error ? "err" : "who"}">${esc(error || (signedIn ? `Signed in as ${config.user.name}` : ""))}</span>`}
            ${signedIn ? `<button class="link" data-signout>Sign out</button>` : ""}
            ${mode === "save" && error ? `<span class="err">${esc(error)}</span>` : ""}
            ${confirmOverwrite ? `<span class="err">Replace ${esc(confirmOverwrite)}?</span>` : ""}
            <button class="b" data-close>Cancel</button>
            ${mode === "open"
              ? `<button class="b primary" data-open ${selected && openable(selected) && !busy ? "" : "disabled"}>Open</button>`
              : `<button class="b primary" data-save ${signedIn && r && !r.readOnly && !busy ? "" : "disabled"}>${confirmOverwrite ? "Replace" : "Save"}</button>`}
          </footer></div>`;
        const on = (sel, ev, fn) => scrim.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));
        on("[data-close]", "click", () => close(null));
        on("[data-device]", "click", () => close("device"));
        on("[data-signin]", "click", async () => { error = (await signIn()) ?? ""; load(); });
        on("[data-signout]", "click", async () => { await api("logout", {}, { method: "POST" }); await loadConfig(); rootId = undefined; render(); });
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
      await ready;
      if (!config.enabled) return "device";
      return dialog("open", { exts: exts ?? null });
    },
    async chooseSave(suggested) {
      await ready;
      if (!config.enabled) return "device";
      return dialog("save", { suggested });
    },
    async write(cloudPath, bytes) {
      const { root: r, path } = split(cloudPath);
      const name = path.split("/").pop();
      toast(`Saving ${name} to ${config.name}…`, false, true);
      try {
        await getJson("file", { root: r, path }, { method: "PUT", body: bytes });
        toast(`Saved ${name} to ${config.name}`);
      } catch (e) {
        toast(e.status === 401 ? `Not saved: sign in to ${config.name} again (File › Save As).` : `Couldn't save ${name}: ${e.message}`, true, true);
        setTimeout(() => (root.querySelector(".toast").hidden = true), 10000);
        // The app keeps the document unsaved only when the write rejects.
        throw e;
      }
    },
  };
})();
