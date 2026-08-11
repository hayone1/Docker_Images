# ws-scrcpy

Browser UI for Android devices over ADB — [NetrisTV/ws-scrcpy](https://github.com/NetrisTV/ws-scrcpy).

Built here because **neither published ws-scrcpy image has an arm64 build** (`xevokk/ws-scrcpy`
and `netris/ws-scrcpy` are amd64-only), and the cluster this targets is entirely arm64 Rockchip
boards running redroid.

## Build

```
Actions → Build and Push Docker Image → Run workflow
  image_folder: ws-scrcpy
  version_tag:  0.1.0
  platforms:    linux/arm64        # or linux/amd64,linux/arm64
```

Produces `hayone/ws-scrcpy:<version_tag>`.

**The `platforms` input is new.** The workflow previously set up QEMU and Buildx but never passed
`platforms` to `build-push-action`, so it always emitted an amd64-only image no matter what.

Expect an **arm64 build to be slow** — it runs under QEMU emulation and this image compiles a
native module (`node-pty`) and runs a webpack build. Budget 20-40 minutes on the first run; the
GHA layer cache added alongside `platforms` should make repeat builds much faster.

## What it does at runtime

ws-scrcpy discovers devices by asking a local `adb` server, so devices must be `adb connect`ed
before it starts. `entrypoint.sh` does that:

- expands `REDROID_COUNT` into `redroid-0..N` Kubernetes service DNS names and connects each
- retries for ~5 minutes at startup, because redroid takes minutes to boot and a cold cluster
  start would otherwise leave the UI permanently empty
- keeps a reconnect loop running, because when a redroid pod restarts its ADB connection goes
  stale silently and the device just vanishes from the web UI with no error

| Variable | Default | Purpose |
|---|---|---|
| `REDROID_COUNT` | *(unset)* | number of instances; expands to `redroid-0..N-1` |
| `REDROID_SERVICE_PREFIX` | `redroid` | service name prefix |
| `REDROID_NAMESPACE` | `apps` | namespace for the DNS suffix |
| `REDROID_PORT` | `5555` | ADB port |
| `ADB_TARGETS` | *(unset)* | explicit `host:port` list; overrides the above |
| `ADB_RECONNECT_SECONDS` | `30` | reconnect loop interval |
| `WS_SCRCPY_CONFIG` | `/config/config.yaml` | ws-scrcpy config path |

Listens on **8000**.

## Build-time choices worth knowing

- **iOS support is compiled out** (`INCLUDE_APPL=false`). It is useless here, and `ios-device-lib`
  ships prebuilt binaries with no arm64 variant — the most likely thing to break an arm64 build.
- **`npm install --ignore-scripts` then `npm rebuild node-pty`.** The `postinstall` hook installs
  Appium drivers for the iOS side; skipping it avoids a large tree we never execute, while the
  explicit rebuild keeps the one native module that is actually needed.
- **`HOME=/tmp` and a non-root user.** adb writes its keys and server state to `$HOME`; without a
  writable one it fails to start the server.

## Verified

`hayone/ws-scrcpy:0.0.1-build.1` builds and runs on arm64. In the dev cluster it:

- pulled as arm64 (79 MB) and started first try, no restarts
- attached all 15 redroid instances on the first connect attempt
- pushed the scrcpy server to every device (15 `start server` lines)
- serves HTTP 200 behind the shared gateway with a trusted certificate
- idles at **1m CPU / 34Mi** — the resource requests in the chart are generous by comparison

Node 20 built `node-pty` on arm64 without trouble, and dropping the Appium postinstall caused no
problems, so the concerns listed here before the first build did not materialise.
