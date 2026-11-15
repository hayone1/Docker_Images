#!/bin/sh
# Hosts such as Railway mount a fresh volume owned by root over /home/coder. As root, give the home
# folder to coder (uid 1000), then run start.sh as coder. As any other user (Kubernetes with
# runAsUser and fsGroup), run start.sh directly.
set -eu
if [ "$(id -u)" = 0 ]; then
  [ "$(stat -c %u /home/coder)" = 1000 ] || chown 1000:1000 /home/coder
  exec setpriv --reuid=1000 --regid=1000 --init-groups env HOME=/home/coder USER=coder /opt/craft-studio/start.sh "$@"
fi
exec /opt/craft-studio/start.sh "$@"
