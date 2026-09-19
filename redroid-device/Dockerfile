# redroid presenting itself as a normal retail Android device.
#
# ── Why ──────────────────────────────────────────────────────────────────────────────────────
# Stock redroid announces exactly what it is. Measured on a running instance:
#
#   ro.product.brand        = redroid
#   ro.product.manufacturer = redroid
#   ro.product.model        = redroid13_arm64_only
#   ro.build.fingerprint    = redroid/redroid_arm64_only/...:userdebug/test-keys
#   ro.build.tags           = test-keys
#   ro.build.type           = userdebug
#   ro.debuggable           = 1
#
# Apps that refuse to run on "custom ROMs" are reading those strings. This image rewrites them to
# a normal retail identity. It changes NOTHING else.
#
# ── What this does NOT do ────────────────────────────────────────────────────────────────────
# It does not defeat Play Integrity / hardware attestation. Those require a Google-provisioned,
# hardware-backed keystore that a container simply does not have, and no amount of property
# editing produces one. If an app demands MEETS_DEVICE_INTEGRITY, this image will not satisfy it.
# It helps only against string/heuristic checks — which is what "this is a custom ROM" usually is,
# especially here, since redroid ships no GMS at all (0 Google packages), so an app cannot even
# call the Play Integrity API.
#
# Two other signals remain visible and cannot be fixed from build.prop:
#   * SELinux reports Disabled (redroid runs with it off)
#   * adb is enabled and unauthenticated, because ws-scrcpy and provisioning depend on it
#
# ── The trap that will cost you a boot ───────────────────────────────────────────────────────
# Do NOT blanket-replace the string "redroid" across build.prop. `ro.hardware=redroid` is load
# bearing: Android init resolves hardware-specific init.<hardware>.rc files from it, and changing
# it means the instance never boots. Only the identity keys listed below are rewritten.
#
# ── Build ────────────────────────────────────────────────────────────────────────────────────
#   Actions -> "Build and Push Docker Image"
#     image_folder = redroid-device
#     version_tag  = 13.0.0
#     platforms    = linux/arm64        (match the cluster; use amd64 for x86 nodes)
#
# Supply a fingerprint from a REAL device you own rather than the example below — on that phone:
#   adb shell getprop ro.build.fingerprint
#   adb shell getprop ro.product.model
# and pass them with --build-arg. A fingerprint that does not correspond to a real build is more
# suspicious than the redroid one, not less.

ARG REDROID_TAG=13.0.0_64only-latest

FROM redroid/redroid:${REDROID_TAG} AS base

FROM busybox:1.36 AS patch
# EXAMPLE VALUES — replace with ones read off a real device. Keep the Android version in the
# fingerprint consistent with REDROID_TAG (13 here); a version mismatch is itself a tell.
ARG BRAND=samsung
ARG MANUFACTURER=samsung
ARG MODEL=SM-A536B
ARG DEVICE=a53x
ARG PRODUCT_NAME=a53xnaxx
ARG FINGERPRINT=samsung/a53xnaxx/a53x:13/TP1A.220624.014/A536BXXSBDXA1:user/release-keys
ARG BUILD_ID=TP1A.220624.014

COPY --from=base /system/build.prop   /in/system.prop
COPY --from=base /vendor/build.prop   /in/vendor.prop
COPY --from=base /odm/etc/build.prop  /in/odm.prop

RUN set -eux; mkdir -p /out; \
    for f in system vendor odm; do \
      sed -E \
        `# per-partition identity: ro.product.{system,vendor,odm,product,system_ext}.*` \
        -e "s#^(ro\.product\.[a-z_]+\.brand)=.*#\1=${BRAND}#" \
        -e "s#^(ro\.product\.[a-z_]+\.manufacturer)=.*#\1=${MANUFACTURER}#" \
        -e "s#^(ro\.product\.[a-z_]+\.model)=.*#\1=${MODEL}#" \
        -e "s#^(ro\.product\.[a-z_]+\.device)=.*#\1=${DEVICE}#" \
        -e "s#^(ro\.product\.[a-z_]+\.name)=.*#\1=${PRODUCT_NAME}#" \
        `# and the un-prefixed forms, if present` \
        -e "s#^(ro\.product\.brand)=.*#\1=${BRAND}#" \
        -e "s#^(ro\.product\.manufacturer)=.*#\1=${MANUFACTURER}#" \
        -e "s#^(ro\.product\.model)=.*#\1=${MODEL}#" \
        -e "s#^(ro\.product\.device)=.*#\1=${DEVICE}#" \
        -e "s#^(ro\.product\.name)=.*#\1=${PRODUCT_NAME}#" \
        `# fingerprints: ro.build.fingerprint plus every ro.<partition>.build.fingerprint` \
        -e "s#^(ro\.[a-z_]*\.?build\.fingerprint)=.*#\1=${FINGERPRINT}#" \
        -e "s#^(ro\.bootimage\.build\.fingerprint)=.*#\1=${FINGERPRINT}#" \
        `# release-keys / user build` \
        -e "s#^(ro\.[a-z_]*\.?build\.tags)=.*#\1=release-keys#" \
        -e "s#^(ro\.[a-z_]*\.?build\.type)=.*#\1=user#" \
        -e "s#^(ro\.build\.flavor)=.*#\1=${PRODUCT_NAME}-user#" \
        -e "s#^(ro\.build\.product)=.*#\1=${DEVICE}#" \
        -e "s#^(ro\.build\.description)=.*#\1=${PRODUCT_NAME}-user 13 ${BUILD_ID} 1 release-keys#" \
        -e "s#^(ro\.build\.display\.id)=.*#\1=${BUILD_ID}#" \
        `# stop advertising a debuggable build` \
        -e "s#^(ro\.debuggable)=.*#\1=0#" \
        /in/$f.prop > /out/$f.prop; \
    done; \
    echo '--- remaining "redroid" references (ro.hardware MUST be among them):'; \
    grep -n 'redroid' /out/*.prop || echo '    none'

FROM base
# --link so each file lands in its own layer and merges over the base by overlay semantics,
# rather than being resolved against the base filesystem at build time.
COPY --link --from=patch /out/system.prop /system/build.prop
COPY --link --from=patch /out/vendor.prop /vendor/build.prop
COPY --link --from=patch /out/odm.prop    /odm/etc/build.prop
