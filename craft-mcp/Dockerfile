# syntax=docker/dockerfile:1
# MCP for the craft apps running in a browser tab: each app's CLI in bridge mode behind
# supergateway, with relay.mjs carrying the bridge connection to the tab over a WebSocket.
FROM debian:bookworm-slim AS cli
ARG PHOTOCRAFT_VERSION
ARG VECTORCRAFT_VERSION
ARG LIGHTCRAFT_VERSION
ARG FILMCRAFT_VERSION
ARG EFFECTCRAFT_VERSION
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN set -eu; arch=$([ "$TARGETARCH" = arm64 ] && echo aarch64 || echo x86_64); mkdir /out; \
    for pair in photocraft:$PHOTOCRAFT_VERSION vectorcraft:$VECTORCRAFT_VERSION lightcraft:$LIGHTCRAFT_VERSION \
                filmcraft:$FILMCRAFT_VERSION effectcraft:$EFFECTCRAFT_VERSION; do \
      app=${pair%%:*}; v=${pair#*:}; \
      curl -fsSL --retry 3 "https://github.com/storytold/$app/releases/download/v$v/$app-$v-linux-$arch.tar.gz" \
        | tar -xz -C /out --strip-components=2 "$app-$v-linux-$arch/bin/$app-cli"; \
    done

FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
ENV PATH=/app/node_modules/.bin:$PATH
COPY --from=cli /out/ /usr/local/bin/
COPY relay.mjs ./
USER node
EXPOSE 8080 8101 8102 8103 8104 8105
CMD ["node", "relay.mjs"]
