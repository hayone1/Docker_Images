# syntax=docker/dockerfile:1
# Serves the official prebuilt web release (<app>-web-<version>.zip) of a storytold "craft" app.
# The workflow .github/workflows/craft-web.yml unpacks the zip into ./site before the build,
# so no Rust/wasm toolchain runs here. nginx.conf mirrors photocraft's packaging/web/nginx.conf.
ARG NGINX_VERSION=1.28-alpine
FROM nginx:${NGINX_VERSION}
ARG APP
ARG VERSION
COPY nginx.conf /etc/nginx/nginx.conf
COPY --chown=nginx:nginx site/ /usr/share/nginx/html/
# Precompress the large assets; nginx serves them via gzip_static.
RUN find /usr/share/nginx/html -type f \( -name '*.wasm' -o -name '*.js' -o -name '*.html' \) -exec gzip -9 -k {} \;
USER nginx
EXPOSE 8080
ENTRYPOINT []
CMD ["nginx", "-g", "daemon off;"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
