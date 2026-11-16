#!/bin/bash
# Craft VS Code: starts Caddy, the craft-mcp relay and code-server, and stops the container when one
# of them stops (the host then restarts it).
#
# Settings (environment variables), all optional:
#   PUBLIC_URL         The address people open, e.g. https://studio.example.com. Found without help
#                      on Railway (RAILWAY_PUBLIC_DOMAIN), Render (RENDER_EXTERNAL_URL), Koyeb
#                      (KOYEB_PUBLIC_DOMAIN) and Fly.io (FLY_APP_NAME). Default http://localhost:$PORT.
#   PASSWORD           code-server's password. Unset: one is made on the first start, saved in
#                      ~/.craft-studio/secrets.env and printed in the log. HASHED_PASSWORD works too.
#   AUTH               "password" (default) or "none". Use "none" only behind another sign-in.
#   PORT               The port to serve (default 8080).
#   PROJECT_DIR        The folder VS Code opens (default ~/project).
#   CRAFT_APP_URL      Where the apps are. Unset: the app pages inside this container.
#   CRAFT_RELAY_URL    A craft-mcp relay outside this container, with CRAFT_RELAY_TOKEN (one of its
#                      MINT_TOKENS). Unset: the relay inside this container, at PUBLIC_URL/relay.
#   RELAY_UPSTREAM     With an outside relay: its inside address (craft-mcp:8080). PUBLIC_URL/relay/
#                      then goes there, so the relay needs no address of its own.
#   MCP_KEY            The inside relay's signing secret. Unset: made once and saved.
#   EMBED_ORIGINS      Editors that may frame the inside apps. Default: PUBLIC_URL,vscode-webview://*
#   EXTENSIONS         More Open VSX extensions to install, comma separated.
#   UPDATE_EXTENSIONS  "false": keep the installed Claude Code and Craft Apps versions.
#   CLAUDE_CLI         "false": don't install the Claude Code command (the extension has its own).
set -euo pipefail
set -f # an origin's * is not a file name pattern

PORT=${PORT:-8080}
export HOME=${HOME:-/home/coder}
export PATH="$HOME/.local/bin:$PATH"
STATE="$HOME/.craft-studio"
mkdir -p "$STATE" && chmod 700 "$STATE"

say() { printf '[craft-vscode] %s\n' "$*"; }
random() { head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32; }

# ---- the public address ------------------------------------------------------------------------
if [ -z "${PUBLIC_URL:-}" ]; then
  if [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then PUBLIC_URL="https://$RAILWAY_PUBLIC_DOMAIN"
  elif [ -n "${RENDER_EXTERNAL_URL:-}" ]; then PUBLIC_URL="$RENDER_EXTERNAL_URL"
  elif [ -n "${KOYEB_PUBLIC_DOMAIN:-}" ]; then PUBLIC_URL="https://$KOYEB_PUBLIC_DOMAIN"
  elif [ -n "${FLY_APP_NAME:-}" ]; then PUBLIC_URL="https://$FLY_APP_NAME.fly.dev"
  else
    PUBLIC_URL="http://localhost:$PORT"
    say "PUBLIC_URL is not set, so the studio expects http://localhost:$PORT. On a server, set PUBLIC_URL to the https address people open."
  fi
fi
PUBLIC_URL=$(printf '%s' "$PUBLIC_URL" | tr 'A-Z' 'a-z' | sed 's:/*$::')
if ! printf '%s' "$PUBLIC_URL" | grep -Eq '^https?://[a-z0-9.-]+(:[0-9]+)?$'; then
  say "PUBLIC_URL must be scheme://host[:port] with no path, e.g. https://studio.example.com (got $PUBLIC_URL)" >&2
  exit 1
fi
case "$PUBLIC_URL" in
  http://localhost*|http://127.0.0.1*|https://*) ;;
  *) say "warning: $PUBLIC_URL is plain http. Browsers only run VS Code's panels on https or localhost." ;;
esac

# ---- secrets made once, kept on the home volume -------------------------------------------------
SECRETS="$STATE/secrets.env"
STUDIO_PASSWORD="" STUDIO_MCP_KEY="" STUDIO_MINT_TOKEN=""
# shellcheck disable=SC1090
[ -f "$SECRETS" ] && . "$SECRETS"
changed=false
[ -n "$STUDIO_PASSWORD" ] || { STUDIO_PASSWORD=$(random); changed=true; }
[ -n "$STUDIO_MCP_KEY" ] || { STUDIO_MCP_KEY=$(random); changed=true; }
[ -n "$STUDIO_MINT_TOKEN" ] || { STUDIO_MINT_TOKEN=$(random); changed=true; }
if [ "$changed" = true ]; then
  umask 077
  printf 'STUDIO_PASSWORD=%s\nSTUDIO_MCP_KEY=%s\nSTUDIO_MINT_TOKEN=%s\n' \
    "$STUDIO_PASSWORD" "$STUDIO_MCP_KEY" "$STUDIO_MINT_TOKEN" > "$SECRETS"
  umask 022
fi

AUTH=${AUTH:-password}
case "$AUTH" in
  none) say "AUTH=none: anyone who reaches $PUBLIC_URL gets a full VS Code with a terminal. Keep another sign-in in front." ;;
  password)
    if [ -z "${PASSWORD:-}" ] && [ -z "${HASHED_PASSWORD:-}" ]; then
      export PASSWORD="$STUDIO_PASSWORD"
      say "Password: $PASSWORD  (saved in $SECRETS; set PASSWORD to choose your own)"
    fi ;;
  *) say "AUTH must be password or none" >&2; exit 1 ;;
esac

# ---- Caddy: the public port, and the app pages inside --------------------------------------------
CADDYFILE=/tmp/Caddyfile
inside_apps=false
if [ -z "${CRAFT_APP_URL:-}" ]; then
  inside_apps=true
  export CRAFT_APP_URL="http://127.0.0.1:4100/"
  origins=""
  for origin in $(printf '%s' "${EMBED_ORIGINS:-$PUBLIC_URL,vscode-webview://*}" | tr ',' ' '); do
    origin=${origin%/}
    if ! printf '%s' "$origin" | grep -Eqi '^[a-z][a-z0-9+.-]*://[a-z0-9*.-]+(:[0-9]+)?$'; then
      say "EMBED_ORIGINS: bad origin $origin (expected scheme://host[:port])" >&2
      exit 1
    fi
    origins="$origins${origins:+,}\"$origin\""
  done
  printf '{"origins":[%s],"files":true}\n' "$origins" > /tmp/craft-embed.json
fi

inside_relay=false
if [ -z "${CRAFT_RELAY_URL:-}" ]; then
  inside_relay=true
  export CRAFT_RELAY_URL="http://127.0.0.1:8081"
  export CRAFT_RELAY_TOKEN="$STUDIO_MINT_TOKEN"
elif [ -z "${CRAFT_RELAY_TOKEN:-}" ]; then
  say "CRAFT_RELAY_URL is set without CRAFT_RELAY_TOKEN: the panels open, but no agent can drive the apps."
fi

relay_upstream=""
if [ "$inside_relay" = true ]; then relay_upstream=127.0.0.1:8081
elif [ -n "${RELAY_UPSTREAM:-}" ]; then relay_upstream=$RELAY_UPSTREAM
fi

{
  cat <<EOF
{
	admin off
	auto_https off
	persist_config off
	servers {
		# Only the host's own proxy reaches this port, so its X-Forwarded-* headers are kept.
		trusted_proxies static 0.0.0.0/0 ::/0
	}
}

:$PORT {
	handle /healthz {
		respond "ok" 200
	}
EOF
  if [ -n "$relay_upstream" ]; then
    cat <<EOF
	handle_path /relay/* {
		reverse_proxy $relay_upstream
	}
EOF
  fi
  cat <<'EOF'
	handle {
		reverse_proxy 127.0.0.1:8443
	}
}
EOF
  if [ "$inside_apps" = true ]; then
    cat <<'EOF'

:4100 {
	bind 127.0.0.1
	@embed path_regexp ^/[a-z]+/_embed/config\.json$
	handle @embed {
		header Cache-Control no-store
		root * /tmp
		rewrite * /craft-embed.json
		file_server
	}
	handle {
		root * /opt/craft-apps
		header X-Content-Type-Options nosniff
		@hashed path *.wasm *.js
		header @hashed Cache-Control "public, max-age=31536000, immutable"
		@page path */ *.html
		header @page Cache-Control no-cache
		file_server {
			precompressed gzip
		}
	}
}
EOF
  fi
} > "$CADDYFILE"

pids=()
stop() { kill "${pids[@]}" 2>/dev/null || true; }
trap stop EXIT INT TERM

XDG_DATA_HOME=/tmp/caddy XDG_CONFIG_HOME=/tmp/caddy caddy run --config "$CADDYFILE" --adapter caddyfile &
pids+=($!)

if [ "$inside_relay" = true ]; then
  (cd /opt/craft-mcp && exec env PORT=8081 MCP_KEY="${MCP_KEY:-$STUDIO_MCP_KEY}" PUBLIC_HOST="$PUBLIC_URL/relay" \
    MINT_TOKENS="$STUDIO_MINT_TOKEN" node relay.mjs) &
  pids+=($!)
fi
unset MCP_KEY

# ---- the home folder, settings and extensions ----------------------------------------------------
[ -f "$HOME/.bashrc" ] || cp -rT /etc/skel "$HOME" 2>/dev/null || true
PROJECT_DIR=${PROJECT_DIR:-$HOME/project}
mkdir -p "$PROJECT_DIR" "$HOME/.local/share/code-server/User"
[ -f "$HOME/.local/share/code-server/User/settings.json" ] ||
  cp /opt/craft-vscode/settings.json "$HOME/.local/share/code-server/User/settings.json"

latest() { curl -fsS --max-time 15 "https://open-vsx.org/api/${1%%.*}/${1#*.}" 2>/dev/null | jq -r '.version // empty' 2>/dev/null || true; }
installed=$(code-server --list-extensions --show-versions 2>/dev/null || true)
for ext in anthropic.claude-code hayone1.craft-vscode $(printf '%s' "${EXTENSIONS:-}" | tr ',' ' '); do
  have=$(printf '%s\n' "$installed" | grep -i "^$ext@" | head -n1 | cut -d@ -f2 || true)
  want=""
  if [ -z "$have" ] || [ "${UPDATE_EXTENSIONS:-true}" != false ]; then want=$(latest "$ext"); fi
  if [ -z "$have" ] || { [ -n "$want" ] && [ "$want" != "$have" ]; }; then
    say "Installing $ext${want:+ $want}"
    # The version must be named: --force alone leaves an installed copy as it is, however old.
    code-server --install-extension "$ext${want:+@$want}" --force >/dev/null 2>&1 ||
      say "couldn't install $ext (Open VSX unreachable?); it stays as it is"
  fi
done

if [ "${CLAUDE_CLI:-true}" != false ] && ! command -v claude >/dev/null; then
  (curl -fsSL https://claude.ai/install.sh | bash >/tmp/claude-install.log 2>&1 ||
    say "couldn't install the Claude Code command; see /tmp/claude-install.log") &
fi

say "Open $PUBLIC_URL"
# code-server would listen on $PORT (Caddy's port) instead of --bind-addr.
env -u PORT code-server --bind-addr 127.0.0.1:8443 --auth "$AUTH" --disable-telemetry --disable-update-check \
  --app-name "Craft VS Code" "$PROJECT_DIR" &
pids+=($!)

# Stop when any part stops, so the host restarts the whole container.
wait -n "${pids[@]}" || true
say "a process stopped; stopping the container"
exit 1
