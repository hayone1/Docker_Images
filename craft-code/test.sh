#!/bin/bash
# Smoke test for a craft-code image: ./test.sh <image>
# Starts the container, then checks each part: Caddy, code-server's sign-in, the relay, a minted
# relay connection, the app pages with their editor settings, and the two extensions.
set -eu # no pipefail: `curl | grep -q` would fail when grep stops reading early
image=${1:?usage: test.sh <image>}
name=craft-code-test
port=18080
docker rm -f "$name" >/dev/null 2>&1 || true
docker run -d --name "$name" -p "$port:8080" -e PASSWORD=smoke-test-password "$image" >/dev/null
trap 'docker logs "$name" 2>&1 | tail -n 60; docker rm -f "$name" >/dev/null 2>&1 || true' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
inside() { docker exec "$name" "$@"; }

for _ in $(seq 1 90); do
  curl -fsS "http://127.0.0.1:$port/healthz" >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS "http://127.0.0.1:$port/healthz" | grep -q ok || fail "healthz"
echo "ok: healthz"

# code-server answers (it starts after the extensions are installed).
for _ in $(seq 1 150); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/login" || true)
  [ "$code" = 200 ] && break
  sleep 2
done
[ "$code" = 200 ] || fail "code-server login page answered $code"
curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/" | grep -q 302 || fail "code-server should ask to sign in"
echo "ok: code-server asks for the password"

cookie=$(mktemp)
curl -s -c "$cookie" -o /dev/null --data-urlencode password=smoke-test-password "http://127.0.0.1:$port/login"
grep -q code-server-session "$cookie" || fail "sign-in with the password"
echo "ok: sign-in"

curl -fsS "http://127.0.0.1:$port/relay/healthz" | grep -q ok || fail "relay healthz"
echo "ok: relay at /relay/"

token=$(inside sh -c '. /home/coder/.craft-studio/secrets.env && printf %s "$STUDIO_MINT_TOKEN"')
session=$(inside curl -fsS -X POST -H "Authorization: Bearer $token" "http://127.0.0.1:8081/mint?app=photocraft")
echo "$session" | grep -q '"tab":"ws://localhost:8080/relay/' || fail "minted connection: $session"
echo "ok: relay mints connections at PUBLIC_URL/relay"

for app in photocraft vectorcraft lightcraft filmcraft effectcraft; do
  inside curl -fsS "http://127.0.0.1:4100/$app/" | grep -qi '<html' || fail "$app page"
  inside curl -fsS "http://127.0.0.1:4100/$app/_embed/config.json" | grep -q '"http://localhost:8080"' || fail "$app embed config"
  inside curl -fsS "http://127.0.0.1:4100/$app/" | grep -q "craft-embed:hello" || fail "$app page has no editor embedding (craft-embed.js)"
done
echo "ok: five app pages, editor settings, embedding script"

# Through code-server's port proxy, as the panels load them (signed in).
curl -fsS -b "$cookie" "http://127.0.0.1:$port/proxy/4100/photocraft/" | grep -qi '<html' || fail "app through /proxy/4100/"
echo "ok: app page through code-server's proxy"

exts=$(docker exec -u 1000 -e HOME=/home/coder "$name" code-server --list-extensions)
echo "$exts" | grep -qi '^anthropic.claude-code$' || fail "Claude Code extension missing"
echo "$exts" | grep -qi '^hayone1.craft-vscode$' || fail "Craft Apps extension missing"
echo "ok: extensions $(echo "$exts" | tr '\n' ' ')"

inside sh -c 'for c in photocraft vectorcraft lightcraft filmcraft effectcraft; do command -v $c-cli >/dev/null || exit 1; done' || fail "app CLIs"
echo "ok: app CLIs"
echo "PASS"
