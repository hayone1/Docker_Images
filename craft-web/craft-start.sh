#!/bin/sh
# Starts nginx. First writes /tmp/craft-embed.json (served at /_embed/config.json) from:
#   EMBED_ORIGINS  origins of editors that may frame the app and drive it, comma separated; a *
#                  stands for host labels: https://*.code.example.com, vscode-webview://*.
#                  Without it, no editor may.
#   EMBED_FILES    "false": those editors may not lend their workspace files to the app.
# /tmp is the only place the container writes, so the file system can stay read-only.
set -eu
set -f # an origin's * is not a file name pattern

origins=""
for origin in $(printf '%s' "${EMBED_ORIGINS:-}" | tr ',' ' '); do
  origin=${origin%/}
  if ! printf '%s' "$origin" | grep -Eqi '^[a-z][a-z0-9+.-]*://[a-z0-9*.-]+(:[0-9]+)?$'; then
    echo "EMBED_ORIGINS: bad origin $origin (expected scheme://host[:port], e.g. https://*.code.example.com)" >&2
    exit 1
  fi
  origins="$origins${origins:+,}\"$origin\""
done

case "$(printf '%s' "${EMBED_FILES:-true}" | tr 'A-Z' 'a-z')" in
  true) files=true ;;
  false) files=false ;;
  *) echo "EMBED_FILES: expected true or false" >&2; exit 1 ;;
esac

printf '{"origins":[%s],"files":%s}\n' "$origins" "$files" > /tmp/craft-embed.json
exec nginx -g 'daemon off;'
