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

## Not yet verified

This image has **not been built or run** — it was authored without a local Docker build. The
plausible failure points, in order:

1. `node-pty@0.10.1` compiling against Node 20 on arm64. If it fails, try `NODE_VERSION=18-bookworm`
   as a build arg.
2. `npm run dist` (webpack) under QEMU — slow, and may hit the runner's memory ceiling.
3. `--ignore-scripts` skipping something beyond the Appium hook that the build actually needs.

If the build fails, the log will say which — none of these are subtle.
