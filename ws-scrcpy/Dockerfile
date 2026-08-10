# syntax=docker/dockerfile:1
#
# ws-scrcpy — browser UI for Android devices over ADB.
#
# Exists because neither published ws-scrcpy image (xevokk, netris) has an arm64 build, and the
# cluster this targets is entirely arm64 Rockchip boards.
#
# Build (multi-arch, from the repo root):
#   docker buildx build --platform linux/amd64,linux/arm64 -t hayone/ws-scrcpy:0.1.0 ws-scrcpy/
#
# The GitHub workflow needs `platforms: linux/amd64,linux/arm64` on the build-push step; it sets up
# QEMU and Buildx but never passes platforms, so it otherwise emits an amd64-only image.

ARG NODE_VERSION=20-bookworm

# ── build ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS build
WORKDIR /src

# node-pty is a native module and needs a toolchain; git is for the source checkout.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 make g++ git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG WS_SCRCPY_REF=master
RUN git clone --depth 1 --branch "${WS_SCRCPY_REF}" https://github.com/NetrisTV/ws-scrcpy.git .

# Drop iOS support at build time. It is dead weight here (these are Android containers), and
# ios-device-lib ships prebuilt binaries with no arm64 variant — leaving it in is the most likely
# way this build breaks on arm64.
ENV INCLUDE_APPL=false \
    INCLUDE_GOOG=true \
    APPIUM_SKIP_CHROMEDRIVER_INSTALL=1

# The postinstall hook installs Appium drivers for the iOS side. Skipped for the same reason, and
# because it pulls a large tree we never execute. node-pty still gets built: npm rebuild below.
RUN npm install --no-audit --no-fund --ignore-scripts \
    && npm rebuild node-pty

RUN npm run dist

# `npm run dist` emits dist/ with its own generated package.json, so runtime deps install there.
WORKDIR /src/dist
RUN npm install --omit=dev --no-audit --no-fund --ignore-scripts \
    && npm rebuild node-pty

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS runtime

# ws-scrcpy shells out to the real adb binary — it is not a pure-JS ADB client.
# android-sdk-platform-tools-common brings the udev rules; adb itself is the part that matters.
RUN apt-get update && apt-get install -y --no-install-recommends \
        adb ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && adb version

WORKDIR /app
COPY --from=build /src/dist /app
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Devices to attach to, as a space-separated host:port list. The entrypoint also accepts
# REDROID_COUNT/REDROID_SERVICE_PREFIX/REDROID_NAMESPACE and builds the list itself, which is
# easier to scale than a 15-entry string.
ENV WS_SCRCPY_CONFIG=/config/config.yaml \
    ADB_TARGETS="" \
    REDROID_COUNT="" \
    REDROID_SERVICE_PREFIX=redroid \
    REDROID_NAMESPACE=apps \
    REDROID_PORT=5555 \
    ADB_RECONNECT_SECONDS=30

EXPOSE 8000

# adb keeps state in $HOME; without a writable one it fails under a read-only or non-root fs.
ENV HOME=/tmp
USER node

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
