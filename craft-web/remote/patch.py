"""Add `window.craftRemote` to a craft web app: python3 patch.py <app> <checkout>.

filmcraft and effectcraft already publish `window.<app>.request` and are left as they are.
"""
import pathlib
import sys

# app: (file declaring `mod web;`, anchor in src/web.rs, line inserted after it)
HOOKS = {
    "photocraft": (
        "src/main.rs",
        "                    let mut app = PhotocraftApp::new(session, services(inbox.clone()));\n",
        "                    app = app.with_control(crate::remote::install(&cc.egui_ctx));\n",
    ),
    "vectorcraft": (
        "src/main.rs",
        "                    None => VectorcraftApp::new(Session::new(), services),\n                };\n",
        "                let app = app.with_control(crate::remote::install(ctx));\n",
    ),
    "lightcraft": (
        "src/lib.rs",
        "            .with_chinese_font(chinese_font);\n",
        "        app = app.with_control(crate::remote::install(&cc.egui_ctx));\n",
    ),
}
WASM = '#[cfg(target_arch = "wasm32")]\n'


def insert_after(path, anchor, text):
    body = path.read_text(encoding="utf-8")
    if body.count(anchor) != 1:
        sys.exit(f"patch.py: {path} no longer matches:\n{anchor}")
    path.write_text(body.replace(anchor, anchor + text), encoding="utf-8")


app, root = sys.argv[1], pathlib.Path(sys.argv[2])
if app in HOOKS:
    crate = root / "apps" / f"{app}-web"
    mod_file, anchor, hook = HOOKS[app]
    remote = (pathlib.Path(__file__).parent / "remote.rs").read_text(encoding="utf-8").replace("__UI__", f"{app}_ui_egui")
    (crate / "src/remote.rs").write_text(remote, encoding="utf-8")
    insert_after(crate / mod_file, WASM + "mod web;\n", WASM + "mod remote;\n")
    insert_after(crate / "src/web.rs", anchor, hook)
    if "\nserde_json" not in (crate / "Cargo.toml").read_text(encoding="utf-8").split("[dev-dependencies]")[0]:
        insert_after(crate / "Cargo.toml", "[dependencies]\n", "serde_json = { workspace = true }\n")
