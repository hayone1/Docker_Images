"""Patch a craft web app for the remote images: python3 patch.py <app> <checkout>.

Adds `window.craftRemote` (remote.rs) where the app has no page API of its own, and cloud
storage (storage.rs) where supported. filmcraft, effectcraft and vectorcraft (0.16+) already
publish `window.<app>.request`.
"""
import pathlib
import re
import sys

WASM = '#[cfg(target_arch = "wasm32")]\n'
# app: (file declaring `mod web;`, text of the one web.rs line to add the hook after, hook)
REMOTE = {
    "photocraft": (
        "src/main.rs",
        "let mut app = PhotocraftApp::new(session, services(",
        "                    app = app.with_control(crate::remote::install(&cc.egui_ctx));\n",
    ),
    "lightcraft": (
        "src/lib.rs",
        "            .with_chinese_font(chinese_font);",
        "        app = app.with_control(crate::remote::install(&cc.egui_ctx));\n",
    ),
}
# app: (file declaring `mod web;`, [(file, old text or pattern, new)])
STORAGE = {
    "photocraft": (
        "apps/photocraft-web/src/main.rs",
        [
            (
                "apps/photocraft-web/src/web.rs",
                re.compile(r"PhotocraftApp::new\(session, (services\(.*\))\);$", re.M),
                r"PhotocraftApp::new(session, { let mut s = \1; crate::storage::install(&mut s); s });",
            ),
            # A file picked from the cloud opens with its cloud: path, so Save writes it back.
            (
                "crates/ui-egui/src/file_dialog.rs",
                "            if let Err(e) = self.open_bytes(&name, &bytes) {",
                '            let cloud = name.starts_with("cloud:").then_some(name.as_str());\n'
                "            if let Err(e) = self.open_bytes_from(cloud.and_then(|p| p.rsplit('/').next()).unwrap_or(&name), &bytes, cloud) {",
            ),
        ],
    ),
    "vectorcraft": (
        "apps/vectorcraft-web/src/main.rs",
        [
            (
                "apps/vectorcraft-web/src/web.rs",
                "let services = services(host.inbox.clone(), host.place_inbox.clone(), ctx.clone(), host.locks.clone());",
                "let mut services = services(host.inbox.clone(), host.place_inbox.clone(), ctx.clone(), host.locks.clone());"
                " crate::storage::install(&mut services, host.inbox.clone(), ctx.clone());",
            ),
            (
                "crates/ui-egui/src/lib.rs",
                "io::open_bytes(self, &name, &bytes, None)",
                """io::open_bytes(self, name.rsplit('/').next().filter(|_| name.starts_with("cloud:")).unwrap_or(name.as_str()), &bytes, name.starts_with("cloud:").then(|| name.clone()))""",
            ),
            (
                "crates/ui-egui/src/io.rs",
                "dl(&fileio::file_name(path), bytes);",
                'dl(&if path.starts_with("cloud:") { path.to_string() } else { fileio::file_name(path) }, bytes);',
            ),
        ],
    ),
}


def edit(path, old, new):
    body = path.read_text(encoding="utf-8")
    if isinstance(old, re.Pattern):
        body, n = old.subn(new, body)
    else:
        n = body.count(old)
        body = body.replace(old, new)
    if n != 1:
        sys.exit(f"patch.py: {path} no longer matches:\n{getattr(old, 'pattern', old)}")
    path.write_text(body, encoding="utf-8")


def after_line(path, needle, hook):
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    found = [i for i, line in enumerate(lines) if needle in line]
    if len(found) != 1:
        sys.exit(f"patch.py: {path} no longer has one line with:\n{needle}")
    lines.insert(found[0] + 1, hook)
    path.write_text("".join(lines), encoding="utf-8")


def add_module(root, crate, mod_file, name, ui):
    here = pathlib.Path(__file__).parent
    template = here / f"{name}-{crate.name.removesuffix('-web')}.rs"
    source = (template if template.exists() else here / f"{name}.rs").read_text(encoding="utf-8").replace("__UI__", ui)
    (crate / "src" / f"{name}.rs").write_text(source, encoding="utf-8")
    edit(root / mod_file, WASM + "mod web;\n", WASM + "mod web;\n" + WASM + f"mod {name};\n")


app, root = sys.argv[1], pathlib.Path(sys.argv[2])
crate = root / "apps" / f"{app}-web"
ui = f"{app}_ui_egui"
if app in REMOTE:
    mod_file, needle, hook = REMOTE[app]
    add_module(root, crate, f"apps/{app}-web/{mod_file}", "remote", ui)
    after_line(crate / "src/web.rs", needle, hook)
    cargo = crate / "Cargo.toml"
    if "\nserde_json" not in cargo.read_text(encoding="utf-8").split("[dev-dependencies]")[0]:
        edit(cargo, "[dependencies]\n", "[dependencies]\nserde_json = { workspace = true }\n")
if app in STORAGE:
    mod_file, edits = STORAGE[app]
    add_module(root, crate, mod_file, "storage", ui)
    for file, old, new in edits:
        edit(root / file, old, new)
