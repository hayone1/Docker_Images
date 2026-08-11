# redroid, patched to start under containerd >= 2.2.
#
# ── The problem ──────────────────────────────────────────────────────────────────────────────
# Stock redroid images fail at container CREATION on containerd 2.2:
#
#   failed to create containerd container: mount callback failed on
#   /var/lib/rancher/k3s/agent/containerd/tmpmounts/containerd-mount…:
#   openat etc/passwd: path escapes from parent
#
# containerd mounts the image rootfs to read /etc/passwd when it computes the container's
# supplementary GIDs. Android ships `/etc` as an ABSOLUTE symlink to /system/etc, and containerd
# 2.2 resolves image paths with openat2 under RESOLVE_BENEATH, which rejects absolute symlinks
# outright. containerd 2.1.5 resolved them in userspace and re-rooted them correctly, so the same
# image runs fine there — this is a regression, not an image defect.
#
# Verified: the failure is independent of Android version (13 and 16 both fail) and of
# securityContext (with and without a numeric runAsUser/runAsGroup), and identical images run on
# a containerd 2.1.5 cluster.
#
# ── The fix ──────────────────────────────────────────────────────────────────────────────────
# Shadow the symlink with a REAL /etc directory holding a minimal passwd/group, which is all
# containerd's lookup needs. Android itself does not read /etc/passwd — it resolves its own users
# through bionic's built-in AID table — so adding these files changes no runtime behaviour.
#
# `COPY --link` is the load-bearing detail. A plain COPY resolves the destination against the base
# image's filesystem, follows `/etc` to /system/etc and writes there, leaving the offending
# symlink in place. `--link` builds the layer independently and merges it with overlay semantics,
# so a real directory replaces the symlink.
#
# ── Build ────────────────────────────────────────────────────────────────────────────────────
#   Actions -> "Build and Push Docker Image"
#     image_folder = redroid-etcfix
#     version_tag  = 16.0.0
#     platforms    = linux/amd64          (match the target node; arm64 nodes can use upstream)
#
# Then point the chart at it:
#   image.repository: hayone/redroid-etcfix
#   image.tag: 16.0.0
#
# Revisit this once the cluster runs containerd 2.1.x or a containerd release that restores
# absolute-symlink resolution — at that point plain redroid/redroid works and this can be dropped.

ARG REDROID_TAG=16.0.0_64only-latest

FROM busybox:1.36 AS etcgen
# Minimal, valid passwd/group. root only: nothing in the Android image consults these beyond
# containerd's GID lookup.
RUN set -eux; \
    mkdir -p /newetc; \
    printf 'root:x:0:0:root:/:/system/bin/sh\n' > /newetc/passwd; \
    printf 'root:x:0:\n'                        > /newetc/group; \
    chmod 0644 /newetc/passwd /newetc/group

FROM redroid/redroid:${REDROID_TAG}
# --link is required; see the note above.
COPY --link --from=etcgen /newetc /etc
