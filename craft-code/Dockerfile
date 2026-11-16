# syntax=docker/dockerfile:1
# Craft Code: everything in one container, for one-click hosts (Railway, Render, Koyeb, Fly.io,
# a VPS). One port ($PORT, default 8080) serves:
#   /          code-server (VS Code in the browser) with Claude Code and Craft Apps (craft-vscode)
#   /relay/    the craft-mcp relay, so the app pages and the coding agent can reach each other
# Inside the container, Caddy also serves the five craft app pages on 127.0.0.1:4100/<app>/; the
# Craft Apps extension shows them in editor panels through code-server's /proxy/<port>/, so
# code-server's password covers the apps too.
# start.sh documents the settings. The parts come from the images CI already builds, so this
# image only copies files. Build from the repo root: docker build -f craft-code/Dockerfile .
ARG CODE_SERVER_IMAGE=codercom/code-server:latest
ARG NAMESPACE=hayone

FROM ${NAMESPACE}/craft-mcp:latest AS relay
FROM ${NAMESPACE}/photocraft:remote AS photocraft
FROM ${NAMESPACE}/vectorcraft:remote AS vectorcraft
FROM ${NAMESPACE}/lightcraft:remote AS lightcraft
FROM ${NAMESPACE}/filmcraft:remote AS filmcraft
FROM ${NAMESPACE}/effectcraft:remote AS effectcraft
FROM caddy:2-alpine AS caddy
FROM node:22-bookworm-slim AS node

FROM ${CODE_SERVER_IMAGE}
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl jq git util-linux \
    && rm -rf /var/lib/apt/lists/*

# Node 22 with npm and npx: the relay needs it, and coding agents use npx for MCP servers.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -sf ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && node --version && npm --version

COPY --from=caddy /usr/bin/caddy /usr/local/bin/caddy

# The relay and the five app CLIs it runs in bridge mode.
COPY --from=relay /app /opt/craft-mcp
# The relay source from this repo, so a relay change reaches the studio in the same run.
COPY craft-mcp/relay.mjs craft-mcp/storage.mjs /opt/craft-mcp/
COPY --from=relay /usr/local/bin/photocraft-cli /usr/local/bin/vectorcraft-cli /usr/local/bin/lightcraft-cli \
    /usr/local/bin/filmcraft-cli /usr/local/bin/effectcraft-cli /usr/local/bin/

# The app pages (the remote variants: relay client and editor embedding), with their .gz copies.
COPY --from=photocraft /usr/share/nginx/html /opt/craft-apps/photocraft
COPY --from=vectorcraft /usr/share/nginx/html /opt/craft-apps/vectorcraft
COPY --from=lightcraft /usr/share/nginx/html /opt/craft-apps/lightcraft
COPY --from=filmcraft /usr/share/nginx/html /opt/craft-apps/filmcraft
COPY --from=effectcraft /usr/share/nginx/html /opt/craft-apps/effectcraft

COPY --chmod=755 craft-code/entrypoint.sh craft-code/start.sh /opt/craft-code/
COPY craft-code/settings.json /opt/craft-code/settings.json

ENV PORT=8080 \
    CRAFT_APPS=photocraft,vectorcraft,lightcraft,filmcraft,effectcraft
EXPOSE 8080
# Keep /home/coder on a volume: projects, settings, extensions and the generated secrets live there.
# (No VOLUME line: some hosts, Railway among them, refuse images that declare one.)
# Starts as root only to give a fresh volume to the coder user, then runs start.sh as coder. In
# Kubernetes with runAsUser 1000 it runs start.sh directly.
# dumb-init (in the code-server image) forwards signals and reaps processes.
ENTRYPOINT ["/usr/bin/dumb-init", "/opt/craft-code/entrypoint.sh"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1
