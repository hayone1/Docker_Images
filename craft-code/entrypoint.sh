#!/bin/sh
# Hosts such as Railway mount a fresh volume owned by root over /home/coder. As root, give the home
# folder to coder (uid 1000), then run start.sh as coder. As any other user (Kubernetes with
# runAsUser and fsGroup), run start.sh directly.
set -eu
# A host's settings form can keep a space typed around a name ("CRAFT_APPS "). The shell drops a
# setting with such a name, so read it from this process's own start-up environment and pass it on
# under the trimmed name. It wins over the image's default for that name.
spaced=$(tr '\0' '\n' </proc/$$/environ |
  sed -n 's/^[[:space:]]*\([A-Za-z_][A-Za-z0-9_]*\)[[:space:]]\{1,\}=/\1=/p; t; s/^[[:space:]]\{1,\}\([A-Za-z_][A-Za-z0-9_]*\)=/\1=/p')
if [ -n "$spaced" ]; then
  while IFS= read -r setting; do
    echo "[craft-code] the setting ${setting%%=*} has spaces around its name; using it without them"
    # shellcheck disable=SC2163 # export the variable that the setting names
    export "$setting"
  done <<EOF
$spaced
EOF
fi
if [ "$(id -u)" = 0 ]; then
  [ "$(stat -c %u /home/coder)" = 1000 ] || chown 1000:1000 /home/coder
  exec setpriv --reuid=1000 --regid=1000 --init-groups env HOME=/home/coder USER=coder /opt/craft-code/start.sh "$@"
fi
exec /opt/craft-code/start.sh "$@"
