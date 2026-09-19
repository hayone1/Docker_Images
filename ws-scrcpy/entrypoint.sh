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
    # Do ONE connect pass, then start the server. Do not block on all devices being online.
    #
    # This used to retry for up to 5 minutes waiting for every device, and only then exec node.
    # With all instances healthy the loop broke immediately and nobody noticed — but when a single
    # redroid pod failed to boot, the wait ran its full length, the liveness probe had nothing
    # listening to probe, and the container was killed and restarted forever. One sick Android
    # took down browser access to the other fourteen (observed 2026-08-12: "attempt N: 14/15
    # online" on repeat, CrashLoopBackOff).
    #
    # Devices that are not up yet get attached by the reconnect loop below, which is the same
    # mechanism that already handles a pod restarting later. There is no reason to treat a device
    # that is slow to boot differently from one that restarts an hour from now.
    log "attaching $n device(s) (non-blocking)"
    connect_all
    online=$(adb devices | grep -c "device$" || true)
    log "$online/$n online at startup; the rest will attach as they come up"
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
