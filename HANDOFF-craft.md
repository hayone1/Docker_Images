# Handoff: craft apps, craft-mcp, craft-web-gateway, craft-code (updated 2026-11-18)

> 2026-11-12: craft-ai-hub was renamed craft-web-gateway, via craft-gateway for a day (GitHub repo hayone1/craft-web-gateway, local folder `craft-web-gateway`, image `hayone/craft-web-gateway`, still also pushed as `hayone/craft-ai-hub`; `hayone/craft-gateway` gets no new images). Older notes below say craft-ai-hub. The cluster objects keep the name craft-ai-hub.

Read with `exoduschurch-platform/cluster-upstream/apps/craft-apps/HANDOFF.md` (older, deployment-focused).

## Repos and what lives where

| Repo (local path) | Contents |
| --- | --- |
| `hayone1/Docker_Images` (`C:\Users\Admin\source\repos\GitHub\Docker_Images`) | `craft-web/` (app images; `remote/` patch: `patch.py`, `remote.rs`, `storage-*.rs`, `craft-remote.js`, `craft-storage.js`, `inject.py`), `craft-mcp/` (relay `relay.mjs`, OIDC + S3 `storage.mjs`), `.github/workflows/craft-web.yml` (builds everything, every 3 h + on push + dispatch) |
| `hayone1/craft-ai-hub` (`C:\Users\Admin\source\repos\GitHub\craft-ai-hub`), public, MIT | Hub: `server.mjs` (launcher, proxy `/<app>/`, auth, `/_relay`, `/_storage`, token cookie), `chat.mjs` (sessions, permission modes), `claude.mjs`, `codex.mjs`, `seal.mjs`, `public/overlay.js` (overlay UI), `examples/` (basic-auth, caddy-https, oauth2-proxy, cloud-storage, external-apps, kubernetes), CI smoke test. Image `hayone/craft-ai-hub` is built by Docker_Images' workflow (job `craft-ai-hub` checks out this repo), not by the hub repo. |
| `hayone1/exoduschurch-platform` | `cluster-upstream/apps/craft-apps/base/` (`Auth.yaml` craft-auth nginx, `Mcp.yaml`, `Hub.yaml`, `HTTPRoute.yaml`); Stalwart client `craft-apps` in `stalwart-mail-server/base/` |

## CI (craft-web.yml)

- Matrix: 13 apps × `official` | `remote`. Remote only for photocraft, vectorcraft, lightcraft, filmcraft, effectcraft (the five craft-mcp supports). photo/vector/light build from source with `patch.py`.
- `patch.py` REMOTE hooks match the one web.rs line containing a needle (`after_line`); STORAGE edits take exact text or a `re.Pattern`. Dry-run locally: sparse-clone the upstream tag (`git -c core.longpaths=true clone --depth 1 --filter=blob:none --sparse`, then `sparse-checkout set apps/<app>-web crates/ui-egui/src`) and run `python patch.py <app> .`.
- Last fix `6c6add9`: photocraft 0.15.1 (`services()` takes 3 args), vectorcraft 0.16.0 (ships its own `window.vectorcraft` page API, so no remote.rs; the connector already falls back to `window[app].request`). photocraft 0.15 also loads its wasm through a small boot module + gzip parts (`app/parts.txt`, `app/*.part-aa`).
- Upstream releases often break `patch.py` anchors or `storage-*.rs` types. Fix pattern: read the failing job log, clone the upstream tag, re-anchor. Earlier fix `08df640`: photocraft 0.9.0 (cloud open now via `open_bytes_from(name, bytes, path)` in `file_dialog.rs`), vectorcraft 0.11.0 (`DownloadFn` returns `Result<(), String>`). Earlier: photocraft 0.8.2 `FileDialogRequest::Folder` (wildcard arm in `storage-photocraft.rs`).
- Reading logs and dispatching need a token: `printf 'protocol=https\nhost=github.com\n\n' | git credential fill`. No `gh` CLI. Dispatch: `POST /repos/hayone1/Docker_Images/actions/workflows/craft-web.yml/dispatches {"ref":"main"}` (rebuilds craft-ai-hub image after hub repo pushes).
- Docker Hub description updates use `DOCKERHUB_DESCRIPTION_TOKEN || DOCKER_PASSWORD` (token now has RWD scope).

## Architecture

```
browser ─▶ craft.exodusmissions.org ─▶ craft-auth (oidc login) ─▶ craft-ai-hub ─▶ /<app>/ ─▶ 10.0.0.1:4101-4105 (hayone/<app>:remote)
tab ◀─ wss://craft-mcp.exodusmissions.org/<key>/tab/<app> (craft-remote.js)
chat: overlay ─▶ /_hub/chat ─▶ Claude Code (Agent SDK) ─MCP http─▶ craft-mcp /<key>/<app>/mcp ─▶ <app>-cli ─▶ tab
external: Claude Code / claude.ai / ChatGPT / Codex ─▶ same MCP URL (Connect tab: claude.ai link, `claude mcp add`, `codex mcp add`, ChatGPT developer-mode steps)
```

- Apps keep only the connector (`craft-remote.js`, exposes `window.craftAssistant`; hides its own UI when `window.craftHub` exists). Chat code lives only in the hub.
- Relay keys `<expiry>.<nonce>.<hmac>` signed with `MCP_KEY`; hub verifies them before chat. Chats scoped per key (per browser).
- craft-mcp `storage.mjs` takes the OIDC redirect origin from trusted header `X-Craft-Origin` (hub sends it); Stalwart client `craft-apps` has `https://craft.exodusmissions.org/_storage/callback`.
- Chat tokens: each user pastes their own `claude setup-token` token in the overlay Account tab (AES-GCM in HttpOnly cookie on `/_hub`). `CHAT_TOKENS` personal|shared|both|off; Exodus runs personal (no shared token). User tested setup-token flow: works. VS Code's Claude Code exe: `%USERPROFILE%\.vscode\extensions\anthropic.claude-code-<ver>-win32-x64\resources\native-binary\claude.exe`.

## Codex (OpenAI) chat, added 2026-10-24 (craft-ai-hub `ad017f0`, `e1db29c`)

- `CHAT_PROVIDERS=claude,codex`. Files: `chat.mjs` (sessions, permission modes), `claude.mjs`, `codex.mjs` (Codex SDK 0.162.1 + ChatGPT sign-in), `seal.mjs`.
- Sign-in: Account tab, device code (`codex login --device-auth` run by the hub; works from iPad) or paste `~/.codex/auth.json`. Stored in `DATA_DIR` (`/data`, Exodus PVC `craft-ai-hub-data`, longhorn 1Gi) encrypted with a key only the browser cookie `craft_hub_codex` holds; refreshed copy written back after each chat.
- Codex runs with features off (shell_tool, unified_exec, apps, plugins, multi_agent, browser, computer_use, image_generation, view_image, …), read-only sandbox, scrubbed env. Keep `code_mode_host` on: MCP tools go through code mode (JS isolate without require/process/fetch). MCP server needs `default_tools_approval_mode="approve"`; permissions are enforced by the hub's loopback gate `/_hub/mcp/<gate>`.
- Image needs `ca-certificates` (Codex binary uses system CAs).
- Connect tab (craft-ai-hub `7d80ee3`, `4f6df30`, last): ChatGPT row copies the URL and shows developer-mode app steps (shown before the clipboard copy, kept across redraws); Codex row copies `codex mcp add <app>-<id> --url <mcp>`.
- Tests: local rig (fake app page with stub `craftAssistant`, fake MCP server, hub) all pass; live on PhotoCraft passed. Don't test with a copy of your own auth.json for long: a refresh in the copy could rotate the refresh token away from your local CLI.

## Upstream PRs (opened 2026-10-25)

Each has a linked issue in plain language. Branches live in hayone1 forks; local clones in `C:\Users\Admin\source\repos\GitHub\upstream\` (remote `fork`). Each repo's first PR adds `[people.hayone1] sync_github_name = true` to `contributors/people.toml` (user's choice).

| PR | Branch | Issue |
| --- | --- | --- |
| storytold/photocraft#9345 `window.photocraft` page API | `web-page-api` | #9343 |
| storytold/photocraft#9346 host storage `window.craftStorage` | `web-host-storage` | #9344 |
| storytold/vectorcraft#4112 host storage | `web-host-storage` | #4111 |
| storytold/lightcraft#2894 `lightcraft.request` | `web-page-api` | #2893 |

- **Owner decision (2026-10-27), state 2026-10-29:** the project owner wdunn001 ruled on craft-libs#360, vectorcraft#4112 and lightcraft#3047 (tracker tangency-labs/solidcraft#7420): storage across the Craft apps is `craft-cloud` (`Files`, account, conflicts) with one Open/Save/Places chrome (`craft_ui::cloud`, both only in the owner's unmerged storytold/craft-libs#160, branch `wdunn001/craft-libs:craft-runtime-upstream`). Each destination lives in its own crate or repo; "a whole client inside each app repo is a non-starter". So:
  - New repo **hayone1/craft-page-storage** (public, MIT OR Apache-2.0, local `C:\Users\Admin\source\repos\GitHub\craft-page-storage`): `PageStorage` implements `craft_ui::cloud::CloudBackend` over a Files-shaped `window.craftStorage` (`account`, `list`, `read` (Uint8Array/ArrayBuffer/Blob, cross-frame safe), `write(id, bytes, ifMatch)` → entry, `create(folder, name, bytes)` → entry; optional `sharedWithMe`, `signIn`, `signOut`; rejection `code` conflict/unauthenticated/not_linked/unreachable). Entry `path` defaults to `id` (the Open page browses folders by `path`, parent = cut at last `/`). Keeps only Files/SharedWithMe/Etags capabilities. Pins craft-libs `83041887` (#160 head); move to storytold/craft-libs when #160 lands. CI (GitHub Actions on the repo works): fmt, clippy native+wasm, 5 native + 12 wasm tests in Node, one drives the real `craft_ui::cloud` pages end to end (list, browse folder, open, save with etag, conflict).
  - Closed with a pointer: craft-libs#360 and issue #359, photocraft#9346, vectorcraft#4112 (this also drops the vectorcraft `people.toml` entry, which lived only there), lightcraft#3047. Notes posted on solidcraft#7420 and craft-libs#358 (helenkwok's hosting contract; her craft-libs#413 `@craft/app` passes `window.craftStorage` through unchanged). Issues photocraft#9344, vectorcraft#4111, lightcraft#3046 left open (the need stays; it is met once an app adopts `craft_ui::cloud` and connects `PageStorage`).
  - Still open: photocraft#9345 and lightcraft#2894 (page APIs). 2026-10-29: both now reject params that are not an object, or whose JSON is not an object (NaN, numbers, invalid `Date`, `toJSON` → null), CodeRabbit threads resolved. Heads photocraft `11bc2afd`, lightcraft `0ac1f0a5`.
  - helenkwok (craft-libs#358, 2026-10-29 10:39) accepted the storage split and proposes `craft-web-host` for the host messages (`ready`, `host`, `open`, `save`, `saved`, `dirty`, `failed`, `handoff`, `handoff-done`); no ask for us. Her `@craft/app` sets `window.craftStorage` on the frame only after `window.<app>.request` appears, so craft-page-storage's wiring checks `available()` each frame until offered (`61d063f`, test `a_page_can_offer_its_storage_after_the_app_started`); noted on craft-libs#413. She agreed and fixed it in ad8982f (2026-10-29 11:44): storage is now set as soon as the frame holds the app's page, usually but not always before the app starts. craft-page-storage docs updated to match (`7acfaf6`, CI green); the per-frame check stays.
  - Verified 2026-10-29 on GitHub runners (temp Docker_Images branch, deleted): photocraft#9345 and lightcraft#2894 pass fmt, wasm32 clippy on PR files, site build, and a Chromium check (NaN, number, invalid Date, toJSON null, array reject; null/undefined/{} work). lightcraft also got a docs fix (`bc109309`, CodeRabbit outside-diff note). The back server was not used: 89% disk, 3 GB RAM free, 36 live containers.
  - Do not open per-app storage or page-API PRs for the other apps: the owner rejected per-app storage clients, and craft-libs#413 is the family-wide page API.
  - Hub side not done yet: `craft-web/remote/craft-storage.js` still speaks only the old chooser shape (`chooseOpen`/`chooseSave`/`write`). To serve the new contract it needs `account`/`list`/`read`/`create` and `write(id, bytes, ifMatch)` returning an entry, and craft-mcp `storage.mjs` needs etags (ListObjectsV2 `ETag`, a conditional PUT answering 409/412). Nothing consumes it until an app ships `craft_ui::cloud`.
  - Local cargo now works: toolchain moved to `C:/ck` (short path; the scratchpad path broke `link.exe`). `RUSTUP_HOME=C:/ck/rustup CARGO_HOME=C:/ck CARGO_TARGET_DIR=C:/ck/t PATH=/c/ck/bin:$PATH`, targets x86_64-pc-windows-msvc + wasm32, clippy, rustfmt, `wasm-bindgen-test-runner` 0.2.129 in `C:/ck/bin`.
- **Shared crate (2026-10-26, superseded above):** maintainer bflatastic (storytold/vectorcraft#4112) asked for the `window.craftStorage` contract as one shared crate in craft-libs; the two host-storage PRs are on hold for the project owner. Done: storytold/craft-libs#360 (issue #359), crate `craft-web-host` (`crates/web-host`, branch `web-host` in hayone1/craft-libs, clone `upstream/craft-libs`). Holds `is_host_path` (all targets) and `storage` (wasm32: `available`, `choose_open`/`choose_save` → `OpenChoice`/`SaveChoice`, `write`, `SaveQueue<R>` with `push`/`latest`/`busy`/`take_done`/`on_done`); reads `globalThis.craftStorage` so its 6 wasm tests run in Node; workflow `web-host.yml`. photocraft#9346 (`51fb8542`) and vectorcraft#4112 (`25b355c6`) now depend on it via `git = storytold/craft-libs, rev = 31bda8af…` (the PR commit; bump to the merged commit once #360 lands, squash merge changes the sha) and their `storage.rs` are thin adapters; save semantics stay in the apps. Fork CI for craft-libs needs a dispatch from the fork's default branch: push `web-host:main` to the fork, `gh workflow run web-host.yml --ref web-host`, cancel the push runs, reset fork main. GitHub has now also blocked Actions on hayone1/vectorcraft, so vectorcraft is checked like photocraft (scratchpad `pcwf/.github/workflows/vectorcraft-check.yml`, needs a `ci-verify` branch with the recolor allow).
- **State 2026-10-26 ~09:00 UTC:** all five PRs MERGEABLE, 0 unresolved threads, CodeRabbit "no actionable comments" on the latest heads: photocraft#9345 `415acb67` (rebase of reviewed `91407c27`), photocraft#9346 `e1709583`, vectorcraft#4112 `b4f871a0`, lightcraft#2894 `b61ee00b`, craft-libs#360 `a232848f`. Last round: photocraft host saves report `{pending, hostWrite}` (write_document returns `None`), a host-path save fails without `craftStorage` instead of downloading, host paths stay out of Open Recent (`push_recent`); vectorcraft `io::saves_settled` applies a whole batch before waiting closes run.
- **State 2026-10-26 ~01:00 UTC (before the shared crate): all four MERGEABLE, 0 unresolved threads, CodeRabbit "no actionable comments" on the latest head** (photocraft#9346's head `ea1c0c73` is a pure rebase of reviewed `b4ab530c`). Heads: 9345 `91407c27`, 9346 `ea1c0c73`, 4112 `7b3e96cf`, 2894 `b61ee00b`. "UNSTABLE" on GitHub = upstream CI/SonarCloud `action_required` (first-time contributor; a maintainer must approve the runs), not a failure.
- Host-save design after the CodeRabbit rounds (both host-storage PRs):
  - Host writes run one at a time through a FIFO in `storage.rs`; the host contract says each write must settle (host owns timeouts; CodeRabbit withdrew its timeout request).
  - Only an explicit `"device"` answer goes to the device picker/download; rejections and unexpected answers are logged and count as cancelled.
  - PhotoCraft: `Services::host_write_pending` (id of the latest unanswered write) → `PhotocraftApp::host_write_settled(ctx, id, result)`; the save (`saved()`: path, saved state, Open Recent, hooks) is recorded only on confirmation; `saving()` includes pending host writes, so close prompts/window close wait; the discard prompt moves on only if the doc is clean after confirmation. Egui context reaches storage via `storage::set_context` on its own line, so #9345 and #9346 don't touch the same lines.
  - VectorCraft: `io::saving_document()` names the document whose Save/Save As is writing; each queued save carries that uid; `io::save_settled(app, doc, name, saved, host_path)` marks only that doc modified on failure, or gives it the host path after a host Save As; superseded failures (a later save of the same doc queued) are ignored. `Services::save_in_flight` makes Save Changes › Save, plain Close, Close All and Quit wait (`close_when_saved` list, run in order by `unsaved::save_settled`).
- Earlier round (2026-10-25): params with no JSON reject (photocraft, lightcraft); lightcraft keeps `keep_pixels` and settles replies after `app.logic`; only documents keep host paths (`io::arrival`); vectorcraft reuses the engine's `DocState::mark_unsaved` (don't add another). PhotoCraft `window.photocraft` is installed at the top of `start()` (requests reject "not running yet", `openFile` returns false until the app runs).
- Rebasing: upstream main moves several times a day. `contributors/people.toml` conflicts almost every time; keep main's last entry intact (git may fold its trailing `sync_github_name` line into the hunk) and append `[people.hayone1]` after a blank line.
- Verification: vectorcraft fork CI is dispatched on a fork-only `ci-verify` branch = PR + `#![allow(deprecated)]` in `crates/ui-egui/src/dialogs/recolor.rs` (upstream main fails clippy on `egui::Id::new` there). GitHub blocks Actions on hayone1/photocraft, so photocraft ran through a temporary `tmp-photocraft-check` branch in Docker_Images (scratchpad `pcwf/`): fmt, clippy, `photocraft-ui-egui` tests (skip `a_control_request_changes_the_drawing_language_in_the_same_frame`, which needs craft-fonts and fails on main too), wasm clippy failing only on PR files, and the site built from a fork-only `e2e-merged` branch (both photocraft PRs merged). Browser checks use `e2e-site` branches on the forks and scratchpad `e2e-site/check.mjs` (slow/failing fake host, Save As then Save, close-while-saving). All temp branches deleted 2026-10-26.
- Upstream problems found while testing (not ours): photocraft main's packaged zip has `snippets/` at the root but the page asks for `app/snippets/eframe-…/inline0.js` (404, stuck on "Loading PhotoCraft…"; the check copies the build's snippets in). VectorCraft main clippy `deprecated` in `recolor.rs`.
- Known, not ours: VectorCraft's own `window.vectorcraft` still turns params with no JSON into `{}` (same bug CodeRabbit flagged for photocraft). Possible small follow-up PR.
- Rust formatting locally: `RUSTUP_HOME=C:/ck/rustup /c/ck/bin/rustfmt --edition 2024` (moved from the scratchpad on 2026-10-29). Whole app builds are still left to CI.
- Once merged, drop the matching parts of `craft-web/remote/patch.py`, `remote.rs` and `storage-*.rs`. `craft-storage.js` already speaks the same `window.craftStorage` contract; its `write` must reject on failure (it does) and only answer exactly `"device"` for the device.

## Chat features (overlay)

Model menu (Default, Opus/Sonnet/Haiku 5.5, Fable 5.1; `CHAT_MODELS` overrides), show-thinking toggle, modes menu like Claude Code (Manual, Edit automatically, Plan, Bypass permissions; Shift+Tab cycles; effort slider inside; no Auto mode by user decision), permission cards (Allow / Always allow / Deny), image attach/paste/drop, timer, stop, tool cards, tokens+time line, chat history (☰), slash commands (/model /effort /mode /thinking /clear /help; others pass to Claude Code). Read-only and risky tools are guessed by name regex in `chat.mjs` (`READ_ONLY`, `RISKY`).

## Cloud storage (where files live)

Contabo object storage `https://eu2.contabostorage.com`, bucket `exoduschurch-images-bucket` (keys `OBJECT_STORAGE_ACCESS_KEY_ID`/`_SECRET_KEY` in exoduschurch-platform `.env`). Prefixes (craft-mcp env in `Mcp.yaml`): **My files** `craft/users/<email>/`, **Team** `craft/team/`, **Media** `media/` (read-only). App paths look like `cloud:home/<file>`; craft-mcp `storage.mjs` maps them to keys.

## Deploy / test

- Cluster: kubectl in scratchpad (see `~/.claude/skills/exodus-cluster`), kubeconfig `exoduschurch-platform/cluster-upstream/.kube/dev-kubeconfig.yaml`. Apply: `kubectl kustomize cluster-upstream/apps/craft-apps/overlays/dev | envsubst | kubectl apply -f -` with vars from `.env` (incl. optional `CRAFT_CLAUDE_CODE_OAUTH_TOKEN`). Hub update: `kubectl -n apps rollout restart deploy/craft-ai-hub` (image `:latest`, Always).
- Visible test in the user's Chrome (2026-10-25): scratchpad `e2e/visible.mjs` (headless: false, slowMo): sign in, Connect tab, Account tab, Codex chat creating a 640×400 doc, Plan mode, cloud Save As, sign out. Passed. It always signs out of ChatGPT at the end; if a run dies, delete leftover `/data/codex-accounts/*.enc` in the hub pod.
- Back server apps: `ssh root@157.173.118.246`, `cd ~/exoduschurch-platform-vps/craft-apps && docker compose pull && docker compose up -d` (watchtower does it every 6 h).
- Local test rig (scratchpad, Windows): fake app server, relay with a fake app CLI (`fakecli.mjs`), hub with `TEST_LOCAL_LOGIN` hack (chat uses local Claude Code login), Playwright via `playwright-core` + installed Chrome. No Docker, cargo, gh locally. Kill test servers by port PID, never `taskkill /IM node.exe`.
- Live E2E: temp Stalwart user via `scli.sh create account --json '{"@type":"User","name":"craft-e2e-test","domainId":"k","credentials":{"0":{"@type":"Password","secret":"…"}}}'`, delete after (`delete account --ids <id>`) together with its S3 objects.
  - Sign in locally with Playwright (Stalwart form `#username`, `#password`), save `storageState`.
  - Run the browser tests on the back server in `mcr.microsoft.com/playwright:v1.56.1-noble` (`docker run --rm --ipc=host -v dir:/e2e -w /e2e … node <script>`): the local link to Contabo is erratic (tens of KB/s at times, DNS failures) and the 12 MB photocraft part then never finishes. Remove the image afterwards (disk 85 %).
  - Headless has no GPU: launch Chrome with `--use-angle=swiftshader --enable-unsafe-swiftshader`, open vectorcraft with `?webgl` (WebGPU device is lost otherwise). EffectCraft answers "not running yet" for some seconds after load.
  - Cloud test (2026-10-24, passed photocraft 0.15.1 and vectorcraft 0.16.0): `engine.execute file.new`, `ui.menu.invoke file.saveAs` (vectorcraft first shows its saveOptions dialog: `ui.dialog.confirm`), cloud dialog in the craft-storage shadow root (`[role=dialog][aria-label="Save as"]`, `input.name`, `button[data-save]`; the hub overlay has its own `[role=dialog]`), "Saved … to Exodus Cloud" toast, `_storage/list?root=home`, then `file.open` from the cloud (document path `cloud:home/…`) and `file.save` writes back with no dialog.
  - MCP test (passed all five): `craftAssistant.connect()`, wait for `state === "on"`, `craftAssistant.session.mcp`, then initialize / tools/list / tools/call over HTTP.
  - `fonts/manifest.txt` 404 in photocraft is upstream (the official package has no `fonts/`), harmless.

## Craft Apps in VS Code (2026-10-31)

- New repo hayone1/craft-vscode (v0.1.0, VSIX on GitHub Releases; CI tests and releases on `v*` tags).
  Panels frame `<hub>/<app>/`; one local MCP server at `127.0.0.1:47811/mcp` offers every open app's tools
  as `<app>_<tool>` plus `craft_apps`, `craft_open`, `craft_call`; adds itself to Claude Code.
- Hub `064486e`: `EMBED_ORIGINS`; the overlay answers `craft-embed:hello` from an allowed direct parent with
  `craft-hub:session` (app, state, MCP URL). Cluster: `EMBED_ORIGINS=https://*.code.exodusmissions.org`
  (kubectl set env, and in platform `b5e536a`).
- Coder template `docker-ide` pushed with: `CRAFT_HUB_URL`, `claude mcp add craft`, VSIX install
  (`craft_vscode=0.1.0`). Existing workspaces need Update. Server README section "Craft Apps".
- Verified on a real workspace (deleted after): Chromium drove VectorCraft (doc, star, text) and PhotoCraft
  (new doc) in the panels over MCP; `craft_open` opened EffectCraft in the focused window; dead-window
  ownership and takeover work; `claude mcp list` shows `craft` connected. WebKit (iPad emulation): nested
  same-site frames get the hub cookie, handshake, relay and app start. Not tested: a real Claude chat (no
  token here), real iPad Safari.
- Gotchas: undici instead of global fetch (VS Code proxy fetch hangs in hosts whose tab is gone); VS Code Web
  (`serve-web`) puts webviews on vscode-cdn.net, so Safari drops the hub cookie; use code-server.
- Docker_Images `b24b485`: copy `snippets/` into `app/` (storytold/photocraft#10491; every app's packaging
  has it). Forced rebuild 41212867931; photocraft, vectorcraft, effectcraft, filmcraft, lightcraft pulled
  on the back server. Back-server disk is at 93% (5.8 GB free).

## Review round 2026-11-02

- lightcraft#2894: FredApps (source-read, not approval) asked who can call the page API, tokens, which methods. Answered;
  docs/web.md now covers callers (page scripts, same-origin parent/opener), no token, methods, files stay in browser.
  CodeRabbit: `with_control` sets `keep_pixels`, so web page now turns it off (770d5645). Rebased on main 0fad22a2.
- photocraft#9345: same docs section (+ same-origin iframe wording), `Reflect::set` false is an error (04f3ee48a).
  Pushed back on bounding the control channel and capping openFile bytes; CodeRabbit withdrew both. Rebased on main fab871dad.
  Upstream main has a clippy `wildcard_imports` error in preset_bridge.rs (not ours).
- Both MERGEABLE, 0 unresolved threads. Fork Actions on hayone1/lightcraft are disabled now.
- craft-page-storage b6846cb: no @craft/app reference (helenkwok removed it from craft-libs#413).

## Round 2026-11-07: craft-web-api adoption

- Image CI broke on lightcraft 0.19 (`with_chinese_font` chained onto `LightcraftApp::new`). Docker_Images `df640b4`
  re-anchors the hook on `let mut app = LightcraftApp::new(session, services)` and also sets
  `app.renderer.keep_pixels = false` after `with_control`. Run 42365698272 green.
- craft-libs#413 (`craft-web-api`, `crates/web-api`) merged 2026-11-05: `PageApi::new(app, Methods, Request).install()`
  adds `request`/`execute`/`commands`/`docInspect`/`uiInspect`/`screenshot` to `window.<app>`, 30 s timeout that drops
  the request future. helenkwok is moving every app onto it (vectorcraft#6015, figcraft#2065 merged; 6 open).
- Its `from_js` turned NaN/numbers/strings/arrays/invalid Date into `{}`. Opened **storytold/craft-libs#656**
  (branch `web-api-params` in hayone1/craft-libs, head `39ba66c1`): rejects them; 9 wasm tests pass locally.
- photocraft#9345 and lightcraft#2894 rebased on main (real conflicts this time: lightcraft main gained a postMessage
  host bridge `?host=parent` and `data-host="page"`), then reworked onto `craft-web-api` pinned to `39ba66c1`
  (bump to the merged commit when #656 lands; squash changes the sha). New `apps/<app>-web/src/api.rs` in both:
  `send()` queues a `ControlRequest`, polls its reply every 16 ms, and on drop gives the request up
  (photocraft `Dispatch::give_up`, lightcraft `ControlRequest::abandon`).
  - photocraft: `Methods { doc_inspect: None }`; `send` strips `data` from `ui.screenshot` params (photocraft's
    `ui.screenshot` refuses unknown fields; crate always adds `data: true`). `openFile` kept; `inspect()` → `uiInspect()`.
  - lightcraft: `Methods { doc_inspect: None, screenshot: None }` (its `ui.screenshot` has no inline PNG). JSON-text
    params no longer accepted by `request`.
- Local wasm tests on Windows: wasm-bindgen-test-runner 0.2.129 writes the bench path unescaped into JS; set
  `WASM_BINDGEN_BENCH_RESULT=C:/ck/wbg_benchmark.json`. photocraft main has its own clippy errors
  (`crates/raster/src/memory.rs` never_loop, `preset_bridge.rs` wildcard import): use `--no-deps -- -A clippy::wildcard-imports`.
- ingling (RushOrderTees) offered on photocraft#9345 (2026-11-04) to test the branch with their Python client;
  accepted in the 2026-11-07 PR comment.
- Pushed 2026-11-07: photocraft#9345 head `69b2c7990`, lightcraft#2894 head `db8b2f118`; both MERGEABLE (UNSTABLE =
  upstream CI awaiting maintainer approval). Verified first on GitHub runners (temp `tmp-api-check` branch in
  Docker_Images, deleted): site built with `packaging/web/package.sh`, Chrome check of every function, params
  rejection, not-running-yet, photocraft `screenshot().data`/`openFile`/`file.new`, lightcraft `command`. All pass.
  Runner image is ubuntu-26.04: `playwright install --with-deps` fails there; use `/usr/bin/google-chrome` via
  `executablePath`. CodeRabbit review requested on both and on craft-libs#656 (one nit, fixed in `47ff147`).
- Next: when craft-libs#656 merges, bump both PRs' `craft-web-api` rev to the merged commit.

## storytold/craft-ai-integrations (checked 2026-11-04)

- What it is: the in-app AI layer (first draft): provider adapters (OpenAI-compatible, BFL FLUX, Vertex, Seedance,
  ArtCraft Omni API key, ComfyUI, local SAM engines), secret stores, `AiClient`/`ToolDesk`, egui widgets. Gives apps
  AI *features* (generate image, segment) on the person's own API keys or local models.
- Ours is a different layer: external agents (Claude Code, Codex, claude.ai) *control* the apps over MCP via the
  control channel, on subscriptions, in the browser. No conflict; nothing to change today.
- Desktop-first: only `craft-ai-core` and `craft-ai-features` are checked for wasm; secret stores and the client are
  native. Docs say no app runs a tool through it yet. So no effect on the web builds the hub serves.
- Helps later: once an app adopts it, its AI tools are app commands, so our MCP path (`engine.execute`) reaches them
  with no work. Hosted providers need API keys (the user avoids those); local engines need a desktop.
- PR #154 (tacitup, opened 2026-11-04, empty template): `craft-ai-mcp`, a localhost MCP server exposing the AI
  tools to the "Bionic" host. It serves the AI tools rather than control of the app, so it doesn't replace craft-mcp
  or craft-vscode. Worth watching if it lands: it could sit beside `craft` in Claude Code.

## Craft Studio: one-click deploys (2026-11-15)

- **craft-vscode since 0.1 (summary):** 0.3 workspace files and agent file tools (`craft_send_file`, `craft_app_files`, `craft_get_file`); 0.5 no gateway needed (the panel mints its own relay connection with CRAFT_RELAY_URL + CRAFT_RELAY_TOKEN, one of craft-mcp's MINT_TOKENS); 0.6 local app proxy (`src/proxy.mjs`, ports 47820+index, `asExternalUri`; path-based forwarders such as code-server's `/proxy/<port>/` are handled by `framedAddress`); 0.6.1 the proxy survives a closed tab. CI publishes to the Marketplace and Open VSX (Trusted Publishing). Coder template `content-studio` (coder-templates, k8s) installs it by version.
- **Image `hayone/craft-studio`** (Docker_Images `craft-studio/`, PR #11 merged `c01451e`): code-server image + Node 22 + Caddy + craft-mcp (relay source copied from the repo) + the five `:remote` app sites. One port (`$PORT`, default 8080): `/` code-server (password), `/relay/` relay, `/healthz`. Inside: apps on 127.0.0.1:4100/<app>/ (Caddy; `_embed/config.json` from EMBED_ORIGINS), relay on 8081. `start.sh` documents the env: PUBLIC_URL (auto from RAILWAY_PUBLIC_DOMAIN / RENDER_EXTERNAL_URL / KOYEB_PUBLIC_DOMAIN / FLY_APP_NAME, else http://localhost:PORT), PASSWORD (else generated, saved in `~/.craft-studio/secrets.env`, printed in the log), AUTH, and CRAFT_APP_URL / CRAFT_RELAY_URL / CRAFT_RELAY_TOKEN / RELAY_UPSTREAM for split deploys, EXTENSIONS, UPDATE_EXTENSIONS, CLAUDE_CLI. Each start installs the newest Claude Code and Craft Apps from Open VSX by version. Entrypoint: as root it chowns a fresh volume, then `setpriv` to uid 1000; as non-root (k8s) it runs start.sh directly. Gotcha fixed: code-server listens on `$PORT` in preference to `--bind-addr`, so start.sh runs it with `env -u PORT`.
- craft-mcp now reads `PORT` (default 8080).
- Workflow `craft-studio.yml`: runs after each craft-web run, on push, daily, and on PRs (build + `craft-studio/test.sh` smoke test, no push). Tag = hash of the input image digests + `craft-studio/` + `craft-mcp/`. The root `.dockerignore` lets only those two folders in.
- **Repo hayone1/craft-studio** (public, MIT, local `C:\Users\Admin\source\repos\GitHub\craft-studio`, autocrlf off): README with the buttons; `docker-compose.yml` (Hostinger button + any VPS: an alpine `setup` job writes DOMAIN, or `<ip>.sslip.io`, and the secrets into volume `setup`; Caddy auto HTTPS to the studio; the studio routes /relay/ to craft-mcp via RELAY_UPSTREAM; the apps get EMBED_ORIGINS https://DOMAIN); `render.yaml` (Render button; disk needs a paid plan); `vercel.json` + `netlify.toml` + `static/build.mjs` (apps-only static site, pulls the pages from the Docker Hub registry without Docker); Helm chart `charts/craft-studio` (CI publishes it to `oci://ghcr.io/hayone1/charts/craft-studio`, public; split: studio + relay + 5 app Deployments; Ingress or HTTPRoute; Secret made once via `lookup`; Secret and PVC have `helm.sh/resource-policy: keep`); `MAINTAINERS.md` (Railway template steps). CI: static build, helm lint + kind install + sign-in + relay check, compose run with DOMAIN=localhost (`test/compose.sh`). All green.
- Vercel and Netlify can only host the static app pages: no long-running container, no WebSockets for the relay. The VectorCraft wasm is 97.5 MB, just under Vercel's 100 MB file limit.
- **Cluster test (left running):** `helm install studio` in namespace `craft-studio-test`, https://craft-studio-test.exodusmissions.org (HTTPRoute on shared-gateway/https, longhorn 5Gi). Password: `kubectl -n craft-studio-test get secret studio-craft-studio -o jsonpath='{.data.password}' | base64 -d`. Verified with Playwright (scratchpad `e2e.mjs`): sign-in, **Craft: Open App** > PhotoCraft runs in the panel; then inside the pod (`mcp.mjs` through kubectl exec) the extension's MCP server lists 32 tools, `craft_apps` says photocraft is connected, and `photocraft_doc_new` made a document ("Untitled — PhotoCraft"). Remove: `helm -n craft-studio-test uninstall studio && kubectl delete ns craft-studio-test`.
- **User-only steps:** create and publish the Railway template (MAINTAINERS.md), then replace the placeholder `https://railway.com/deploy/craft-studio` in the README; press each button once on their own accounts (Railway, Render, Hostinger, Vercel, Netlify); sign in to Claude Code in a studio and try a real chat.

## Craft Code: two options, craft-vscode and craft-coder (2026-11-16)

The 2026-11-15 section above describes the first version. What changed:

- **Names.** The repo hayone1/craft-studio was renamed to **hayone1/craft-code**. GitHub redirects the old links, and the local folder is now `C:\Users\Admin\source\repos\GitHub\craft-code`. The image is **`hayone/craft-code`**, built from the Docker_Images folder `craft-code/` by the workflow `craft-code.yml` (PR #12, merged). The Dockerfile has two targets:
  - `workspace` (tag `:workspace`) holds code-server, Node, git, jq and the craft CLIs, and runs as uid 1000.
  - `vscode` (tags `:vscode` and `:latest`) adds Caddy, the relay and the app sites.
  CI still tags `hayone/craft-studio:latest`, and the state folder keeps the name `~/.craft-studio`.
- **craft-vscode** (one person, behind the code-server password) lives in `vscode/docker-compose.yml` and `charts/craft-vscode`. It keeps the Railway, Render, Hostinger, Vercel and Netlify buttons. The password page is code-server's own page, not a custom one.
- **craft-coder** (a team) lives in `coder/docker-compose.yml` (with its own Hostinger button) and `charts/craft-coder`. It runs a Coder server with Postgres, the relay, the 5 apps and a Caddy front that serves `/relay/`.
  - The shared bootstrap script is `charts/craft-coder/files/bootstrap.sh`. Compose fetches the script and the Docker template from GitHub `main` at each start; a test mounts a checkout at `/source` instead. Helm runs the script as a post-install/post-upgrade Job.
  - The script is idempotent. It creates the first user with `coder login --first-user-*`, or signs in through `/api/v2/users/login`. It pushes template `craft` with a version name that is a hash of main.tf + variables, and skips the push when that version exists. It creates `admin/studio` on the template's first push only.
  - The templates are `charts/craft-coder/files/templates/{docker,kubernetes}/main.tf`. Both use the code-server module with `install_prefix=/usr/lib/code-server` and `subdomain=var.subdomain`. Apps use paths by default; the Helm value `wildcardHost` turns on subdomains.
  - The template replaces the access URL in the agent's init script with `coder_internal_url`: `http://coder:7080` for Compose, `http://<full>.<ns>.svc` for k8s. Compose workspaces join the network `craft-coder`. The Compose `coder` service runs as root to use the Docker socket.
  - Sign-in: Coder passwords. GitHub/OIDC env is documented, through `.env` (`env_file`) or the Helm value `coder.env`.
- **CI** (the craft-code ci.yml) runs these jobs: static, helm-vscode, compose-vscode, helm-coder, compose-coder and publish-chart (both charts).
  - helm-coder lints and renders the chart, and runs terraform fmt+validate on copies of the templates. It then installs into kind through `test/coder-helm.sh`. compose-coder runs `test/coder-compose.sh`.
  - The repo variable WORKSPACE_IMAGE can override the workspace image in the tests.
  - Gotcha: the Coder agent's env reaches only the processes the agent starts, so `docker exec printenv` doesn't see it. Read `/proc/*/environ` instead.
  - Gotcha: terraform validate inside the chart folder leaves a `.coder/pprof` socket, and the socket breaks `helm install`.
- **Cluster test:** craft-coder release `craft` in namespace `craft-coder-test`, at https://craft-coder-test.exodusmissions.org (HTTPRoute on shared-gateway/https, longhorn storage).
  - Admin password: `kubectl -n craft-coder-test get secret craft-craft-coder -o jsonpath='{.data.admin-password}' | base64 -d`.
  - Remove: `helm -n craft-coder-test uninstall craft && kubectl delete ns craft-coder-test`.
- **User-only steps:**
  - Create the Railway template with the image `hayone/craft-code:vscode` (see MAINTAINERS.md), then replace the README placeholder `https://railway.com/deploy/craft-vscode`.
  - Press each button once.
  - Set up GitHub/OIDC sign-in if wanted.

## Eight apps, app picking and saves (2026-11-17)

This round added WordCraft, GridCraft and DeckCraft to every deploy. A person can now pick the apps for a deploy, and can hide an app in the extension's settings. Everything below is merged and published.

- **Merged pull requests.** Docker_Images #13 (`more-apps`) and #14 (`craft-code-more-apps`), craft-vscode #19 (`show-apps`, released as v0.7.0 on the Marketplace and Open VSX), and craft-code #1 (`two-options`). The charts `oci://ghcr.io/hayone1/charts/craft-vscode` and `craft-coder` (0.1.0) pull without signing in.
- **New images.** `hayone/wordcraft:remote`, `hayone/gridcraft:remote` and `hayone/deckcraft:remote` are built by `craft-web.yml`. The other storytold apps (figcraft, cadcraft, soundcraft, designcraft and pdfcraft) are still excluded from the remote build. The image `hayone/craft-code` now holds eight apps and eight CLIs.
- **Relay (`craft-mcp/relay.mjs`).** Each app CLI connects in its own way, so `BRIDGE` and `BRIDGE_ENV` hold one entry per app.
  - wordcraft: `--connect 127.0.0.1:PORT`. The CLI reads its key from `WORDCRAFT_CONTROL_KEY` and sends `{"method":"auth","key":...}`.
  - gridcraft: `--connect PORT`. The CLI reads its token from `GRIDCRAFT_CONTROL_TOKEN` and sends `{method:"auth",params:{token}}`.
  - deckcraft: `--connect 127.0.0.1:PORT`, with no authentication.
- **Host saves (`craft-web/remote/craft-embed.js`).** WordCraft, GridCraft and DeckCraft use the storytold `craft-web-host` contract. The page sets `data-host="page"` on the app's canvas `#<app>_canvas`. The app then sends `<app>:save` events with the file's bytes, and the page answers with `<app>:saved` or `<app>:failed`. The page opens files by sending `<app>:open`.
  - The first save of a new file asks VS Code's Save dialog, through the new `saveAs` operation in craft-vscode `src/files.mjs`. Later saves write to the same path without a dialog. Save As always asks.
  - When an agent is busy (`craftFiles.quiet()`), a save only marks the file saved. The agent then copies the file with `craft_app_files` and `craft_get_file`.
- **Picking the apps.**
  - Compose: each app service has `profiles: ["${APP:-}"]`. Setting `PHOTOCRAFT=off` (or any other app) in `.env` skips that service and its image. The setup job builds `CRAFT_APPS` from the switches and refuses to start when every app is off.
  - Helm: the value `apps.names` lists the apps. craft-coder passes the list to the template variable `craft_apps`, which sets `CRAFT_APPS` in the workspace.
  - Railway, Vercel and Netlify: the variable `CRAFT_APPS`. Vercel fills a default through the button URL (`envDefaults`). Netlify asks through `[template.environment]`.
  - Extension: the setting `craft.showApps` shows one checkbox per app. All apps are shown by default.
- **Open VSX search lag.** For some hours after a release, `code-server --install-extension id@version` answers "not found". The Coder templates and `craft-code/start.sh` now download the release file from `https://open-vsx.org/api/hayone1/craft-vscode` (`.files.download`) and install that file instead.
- **Cluster test** (`craft-coder-test`, release `craft`). The eight app pods run, and the admin workspace has extension 0.7.0 and all eight apps. GridCraft opened in a Coder panel. An agent wrote cells over MCP, saved, and copied `budget.xlsx` into `/home/coder/project/`. A person's Save showed VS Code's dialog and wrote `Book1.xlsx`, and the second save did not ask again.
- **Test scripts** live in the session scratchpad and may be gone. The important ones: `e2e-coder.mjs` (signs in to Coder, opens an app panel, and with `SAVE_TEST=1` checks the Save dialog), `hosttest.mjs` (a fake editor for host saves) and `relaytest.mjs` (drives an app through a local relay container).

## ToDo (as of 2026-11-18)

1. Add FigCraft, CADCraft and PdfCraft in the same way as WordCraft, GridCraft and DeckCraft. First check each CLI's `--connect` and authentication format. PdfCraft ships a separate `pdfcraft-cli` tarball. FigCraft ships a `figcraft-server` asset and may need a different bridge. Then enable each app's remote build in `craft-web.yml`, add the app to `HOST_APPS` in `craft-embed.js` if the app speaks `craft-web-host`, and add the app to the extension, both charts, both Compose files and the static build.
2. User-only: create the Railway template with the image `hayone/craft-code:vscode` and the variables `PASSWORD` and `CRAFT_APPS`, then replace the README placeholder link in craft-code.
3. User-only: press each deploy button once, including both Hostinger buttons. Check that Vercel fills `CRAFT_APPS` and that Netlify asks for `CRAFT_APPS`.
4. User-only, optional: set up GitHub or OIDC sign-in for craft-coder.
5. Decide whether to keep the test namespaces `craft-coder-test` and `craft-studio-test`.
6. Optional: ask GitHub Support to purge the orphan commit `c9df577`.
7. When storytold/craft-libs#656 merges, repin `craft-web-api` in storytold/lightcraft#2894 (`apps/lightcraft-web/Cargo.toml` and `Cargo.lock`) to the craft-libs `main` commit. On 2026-11-18 FredApps re-reviewed #2894 and will approve once the pin points at `main` and the gate is green. The pin is now `420f0255`, the head of #656. Keep every file LF: the lightcraft and craft-libs blobs are LF, and the local clones use `core.autocrlf=true`. Check that staged blobs have no CR bytes before each push.

## Open items

1. Done 2026-10-24: cloud round trip verified on photocraft 0.15.1 and vectorcraft 0.16.0; back server pulled all `:remote` images.
2. Claude in-app chat not re-tested with a real setup-token this round (Codex chat was tested live). User should do their own ChatGPT device sign-in (Account tab) for real use; tests used short-lived copies of their auth.json.
3. Real-app checks of new chat modes (risky-step prompt in Edit automatically, images, Deny).
4. Cloud storage for lightcraft, filmcraft, effectcraft; group-restricted shared folders (SFTPGo key).
5. Done 2026-11-17 for wordcraft, gridcraft and deckcraft (craft-mcp now supports 8 apps). Still open: figcraft, cadcraft and pdfcraft (see the ToDo list above); soundcraft and designcraft have no plan yet.
6. Untested: hub compose examples (no Docker locally).
7. Done 2026-11-16: craft-coder (Coder for teams) in hayone1/craft-code. Not yet: a wildcard (subdomain) option for the craft-coder Compose file, which needs a DNS provider's API for a wildcard certificate.
