// Files between the app in this tab and an AI assistant's editor (craft-vscode). The editor calls
// the craft-mcp relay's /<key>/<app>/files endpoint, the relay sends {method: "craft.files",
// params} over this tab's connection, and craft-remote.js hands the params to handle() here:
//
//   {op: "put", upload, name, data, done}  a file from the editor, in base64 parts. On the last
//       part the app gets the file: VectorCraft opens it, FilmCraft imports it (a .fcproj opens),
//       EffectCraft adds it to its file table and opens or imports it, and the other apps get it
//       as a file dropped on the app.
//   {op: "list"}  the files the app saved, exported or rendered, and FilmCraft's and EffectCraft's
//       own file tables. On the web every app saves by downloading; the downloads are kept here.
//   {op: "read", name, offset, length}  part of one of those files, in base64.
//
// While the assistant works in a page that the editor frames (a request is running, or ran in the
// last few seconds), the app's downloads stay in the page instead of reaching the browser: the
// editor copies them into its workspace. Downloads at other times go on as before and are kept too.
(() => {
  const app = document.currentScript.dataset.app;
  const title = { photocraft: "PhotoCraft", vectorcraft: "VectorCraft", lightcraft: "LightCraft", filmcraft: "FilmCraft", effectcraft: "EffectCraft" }[app] ?? app;
  const KEEP_FILES = 32;
  const KEEP_BYTES = 1 << 30;
  // After a request: downloads the app starts a moment later (a paced click, the next frame).
  const GRACE_MS = 3_000;
  const MAX_UPLOAD = 512 << 20;
  const MAX_PART = 16 << 20;

  // ---- the app's downloads --------------------------------------------------------------------
  // Each app downloads by clicking a link to an object URL. Remember each URL's Blob until the app
  // revokes it, and keep the Blob of each link the app clicks.
  const objects = new Map(); // object URL -> Blob
  const createUrl = URL.createObjectURL;
  const revokeUrl = URL.revokeObjectURL;
  URL.createObjectURL = function (obj) {
    const url = createUrl.call(URL, obj);
    if (obj instanceof Blob) objects.set(url, obj);
    return url;
  };
  URL.revokeObjectURL = function (url) {
    objects.delete(url);
    return revokeUrl.call(URL, url);
  };

  const kept = []; // {name, blob, at}, newest last
  function keep(name, blob) {
    kept.push({ name, blob, at: Date.now() });
    last = null;
    let total = kept.reduce((n, f) => n + f.blob.size, 0);
    while (kept.length > KEEP_FILES || (kept.length > 1 && total > KEEP_BYTES)) total -= kept.shift().blob.size;
  }

  // The editor lends its workspace (craft-web-gateway's overlay adds the place): downloads the
  // assistant causes belong in the workspace, not in the browser's downloads folder.
  let busy = 0;
  let until = 0;
  const framed = () => Array.isArray(window.craftStoragePlaces) && window.craftStoragePlaces.some((p) => p?.id === "workspace");
  const quiet = () => framed() && (busy > 0 || Date.now() < until);

  const click = HTMLElement.prototype.click;
  HTMLElement.prototype.click = function () {
    if (this instanceof HTMLAnchorElement && this.hasAttribute("download")) {
      const blob = objects.get(this.href);
      if (blob) {
        keep(baseName(this.getAttribute("download")) || "download", blob);
        if (quiet()) return;
      }
    }
    return click.call(this);
  };

  // ---- bytes ----------------------------------------------------------------------------------
  const baseName = (s) => String(s ?? "").split(/[\\/]/).pop();
  const fromBase64 = (s) => {
    const bin = atob(String(s));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  const toBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(",") + 1)); };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  const TYPES = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp",
    tif: "image/tiff", tiff: "image/tiff", svg: "image/svg+xml", pdf: "application/pdf", mp4: "video/mp4", mov: "video/quicktime",
    webm: "video/webm", mkv: "video/x-matroska", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg",
  };
  const typeOf = (name) => TYPES[(name.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase()] ?? "";

  // ---- files from the editor ------------------------------------------------------------------
  const uploads = new Map(); // upload id -> {parts, size, timer}
  async function put({ upload, name, data = "", done = false }) {
    if (typeof upload !== "string" || !upload || typeof name !== "string" || !baseName(name)) throw new Error("put needs an upload id and a file name");
    if (typeof data !== "string" || data.length > (MAX_PART / 3) * 4 + 4) throw new Error("a part is a base64 string of up to 16 MB");
    let u = uploads.get(upload);
    if (!u) uploads.set(upload, (u = { parts: [], size: 0 }));
    clearTimeout(u.timer);
    const bytes = fromBase64(data);
    u.size += bytes.length;
    if (u.size > MAX_UPLOAD) {
      uploads.delete(upload);
      throw new Error(`a file for ${title} can have at most ${MAX_UPLOAD >> 20} MB`);
    }
    u.parts.push(bytes);
    if (!done) {
      u.timer = setTimeout(() => uploads.delete(upload), 5 * 60_000);
      return { received: u.size };
    }
    uploads.delete(upload);
    const file = new File(u.parts, baseName(name), { type: typeOf(baseName(name)) });
    return give(file);
  }

  // EffectCraft sets its page functions before its wasm has started; calling one then fails
  // inside wasm-bindgen. Wait for the start (up to 90 s).
  async function started() {
    if (app !== "effectcraft") return;
    for (let i = 0; i < 360; i++) {
      const load = window.effectcraftLoad;
      if (load?.error) throw new Error(`EffectCraft didn't start: ${load.error}`);
      if (load?.readyMs !== undefined) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("EffectCraft is still starting; try again in a moment.");
  }

  // Hand a file to the app the way a person would: the app's own page functions where it has
  // them, else a drop on its canvas.
  async function give(file) {
    await started();
    const api = window[app];
    const about = { name: file.name, size: file.size };
    if (app === "vectorcraft" && typeof api?.openFile === "function") {
      if (!api.openFile(file.name, new Uint8Array(await file.arrayBuffer()))) throw new Error("VectorCraft isn't running yet; try again in a moment.");
      return { ...about, result: "VectorCraft opens the file as it opens a dropped file." };
    }
    if (app === "filmcraft" && typeof api?.importFiles === "function") {
      if (/\.fcproj$/i.test(file.name) && typeof api.openProject === "function") {
        return { ...about, opened: await api.openProject(file), result: "FilmCraft opened the project." };
      }
      return { ...about, imported: await api.importFiles([file]), result: "FilmCraft imported the file into the project." };
    }
    if (app === "effectcraft" && typeof api?.addFile === "function") {
      const path = await api.addFile(file, file.name);
      return {
        ...about, path,
        result: `EffectCraft keeps the file at ${path} in its file table and opens it (.ecproj) or imports it. Name ${path} in EffectCraft's tools.`,
      };
    }
    await drop(file);
    return { ...about, result: `${title} got the file as a file dropped on the app.` };
  }

  // A drop on the app's canvas, once the app takes drops (it accepts the dragover).
  async function drop(file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    for (let i = 0; i < 120; i++) {
      const canvas = document.querySelector("canvas");
      if (canvas) {
        const box = canvas.getBoundingClientRect();
        const at = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
        const send = (type) => canvas.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: dt, ...at }));
        send("dragenter");
        if (!send("dragover")) {
          send("drop");
          return;
        }
        send("dragleave");
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`${title} didn't take the file; it may still be starting.`);
  }

  // ---- files for the editor -------------------------------------------------------------------
  // FilmCraft and EffectCraft keep files in a table of their own (imports, saved projects, renders).
  const tableApi = () => (app === "filmcraft" || app === "effectcraft") && typeof window[app]?.files === "function" ? window[app] : null;
  async function tableFiles() {
    try {
      const list = await tableApi()?.files();
      return Array.isArray(list) ? list.filter((f) => typeof f?.path === "string") : [];
    } catch {
      return [];
    }
  }

  // "tab": kept here (a save or export); "app": in the app's own table (imports too). A table file
  // that the tab also kept (same name and size) is listed once.
  async function list() {
    const files = kept.map((f) => ({ name: f.name, size: f.blob.size, saved: new Date(f.at).toISOString(), from: "tab" }));
    for (const f of await tableFiles()) {
      const name = baseName(f.path);
      const size = Number(f.size) || 0;
      if (!files.some((k) => k.from === "tab" && k.name === name && k.size === size)) files.push({ name, path: f.path, size, from: "app" });
    }
    return files;
  }

  // The newest download called `name` (or a path ending in its name), else the app's table file.
  // A file read in parts is looked up once, for a minute.
  let last = null; // {key, file, until}
  async function find(name) {
    if (last && last.key === name && last.until > Date.now()) return last.file;
    const base = baseName(name);
    let file = null;
    for (let i = kept.length - 1; i >= 0 && !file; i--) if (kept[i].name === base) file = { name: kept[i].name, blob: kept[i].blob };
    const table = !file && tableApi();
    if (table) {
      const paths = (await tableFiles()).map((f) => f.path);
      const path = paths.includes(name) ? name : paths.findLast((p) => baseName(p) === base);
      const bytes = path ? await table.readFile(path) : null;
      if (bytes) file = { name: baseName(path), path, blob: bytes instanceof Blob ? bytes : new Blob([bytes]) };
    }
    if (file) last = { key: name, file, until: Date.now() + 60_000 };
    return file;
  }

  async function read({ name, offset = 0, length = 4 << 20 }) {
    if (typeof name !== "string" || !name) throw new Error("read needs a file name");
    const file = await find(name);
    if (!file) throw new Error(`${title} has no saved file called ${name} in this tab. List them with craft_app_files.`);
    const start = Math.max(0, Number(offset) || 0);
    const end = Math.min(file.blob.size, start + Math.min(Math.max(1, Number(length) || 0), MAX_PART));
    return { name: file.name, ...(file.path ? { path: file.path } : {}), size: file.blob.size, offset: start, data: await toBase64(file.blob.slice(start, end)) };
  }

  async function handle(params = {}) {
    if (params.op === "put") return put(params);
    if (params.op === "list") return { app, files: await list() };
    if (params.op === "read") return read(params);
    throw new Error(`unknown craft.files request: ${String(params.op).slice(0, 40)}`);
  }

  window.craftFiles = {
    handle,
    quiet,
    framed,
    // A file the app wrote by other means (PhotoCraft's automation writes, craft-storage.js).
    keep: (name, blob) => keep(baseName(name) || "file", blob),
    // craft-remote.js runs each assistant request through this.
    async during(run) {
      busy++;
      try {
        return await run();
      } finally {
        busy--;
        until = Date.now() + GRACE_MS;
      }
    },
  };
})();
