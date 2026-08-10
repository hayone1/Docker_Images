#!/bin/sh
# Attach ws-scrcpy to a fixed set of network ADB devices and keep them attached.
#
# ws-scrcpy discovers devices by asking the local adb server, so the devices have to be
# `adb connect`ed before (and after) it starts. Redroid pods restart and their ADB connections go
# stale silently — the device simply disappears from the web UI with no error — hence the
# reconnect loop rather than a one-shot connect at boot.
set -eu

log() { echo "[entrypoint] $*"; }

# Build the target list from REDROID_COUNT when ADB_TARGETS was not given explicitly.
targets() {
    if [ -n "${ADB_TARGETS:-}" ]; then
        echo "$ADB_TARGETS"
        return
    fi
    if [ -n "${REDROID_COUNT:-}" ]; then
        i=0
        list=""
        while [ "$i" -lt "$REDROID_COUNT" ]; do
            list="$list ${REDROID_SERVICE_PREFIX}-${i}.${REDROID_NAMESPACE}.svc.cluster.local:${REDROID_PORT}"
            i=$((i + 1))
        done
        echo "$list"
    fi
}

TARGET_LIST="$(targets)"

connect_all() {
    for t in $TARGET_LIST; do
        adb connect "$t" >/dev/null 2>&1 || true
    done
}

log "starting adb server"
adb start-server >/dev/null 2>&1 || true

if [ -z "$TARGET_LIST" ]; then
    log "no ADB_TARGETS and no REDROID_COUNT set — starting with no devices attached"
else
    n=$(echo "$TARGET_LIST" | wc -w)
    log "attaching $n device(s)"
    # Redroid takes minutes to boot; on a cold cluster start the first attempts will all fail.
    # Retry for a few minutes so a simultaneous rollout does not leave the UI permanently empty.
    attempt=0
    while [ "$attempt" -lt 20 ]; do
        connect_all
        online=$(adb devices | grep -c "device$" || true)
        log "attempt $((attempt + 1)): $online/$n online"
        [ "$online" -ge "$n" ] && break
        attempt=$((attempt + 1))
        sleep 15
    done
    adb devices | sed 's/^/[entrypoint]   /'

    (
        while true; do
            sleep "${ADB_RECONNECT_SECONDS:-30}"
            connect_all
        done
    ) &
    log "reconnect loop running every ${ADB_RECONNECT_SECONDS:-30}s"
fi

log "starting ws-scrcpy"
exec node index.js "$@"
