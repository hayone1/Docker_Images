# redroid-etcfix

redroid with a real `/etc`, so it can start under **containerd >= 2.2**.

## Why this exists

Stock `redroid/redroid` images fail at container creation on containerd 2.2:

```
failed to create containerd container: mount callback failed on
/var/lib/rancher/k3s/agent/containerd/tmpmounts/containerd-mount…:
openat etc/passwd: path escapes from parent
```

containerd mounts the image rootfs to read `/etc/passwd` when computing the container's
supplementary GIDs. Android ships `/etc` as an **absolute** symlink to `/system/etc`, and
containerd 2.2 resolves image paths with `openat2` under `RESOLVE_BENEATH`, which rejects
absolute symlinks. containerd 2.1.5 resolved them in userspace and re-rooted them correctly.

Evidence that it is the runtime and not the image:

| | Android 16 | Android 13 |
|---|---|---|
| privileged | fails | fails |
| privileged + numeric `runAsUser`/`runAsGroup` | fails | fails |

…and the same images run 15 instances on a cluster with containerd 2.1.5-k3s1.

| cluster | k3s | containerd | redroid |
|---|---|---|---|
| softwarecloud | v1.35.2+k3s1 | 2.1.5-k3s1 | works |
| exoduschurch | v1.34.6+k3s1 | 2.2.2-bd1.34 | fails |

Note the inversion — the *newer* k3s carries the *older* containerd.

## What the patch does

Shadows the symlink with a real `/etc` directory containing a minimal `passwd`/`group`. Android
does not read these (bionic resolves its users from a built-in AID table), so runtime behaviour is
unchanged; they exist purely to satisfy containerd's lookup.

`COPY --link` is load-bearing: a plain `COPY` resolves the destination against the base image,
follows `/etc` to `/system/etc` and writes there, leaving the symlink in place. `--link` builds
the layer independently and merges it with overlay semantics, so a real directory replaces it.

## Build

Actions → **Build and Push Docker Image**

| input | value |
|---|---|
| `image_folder` | `redroid-etcfix` |
| `version_tag` | `16.0.0` |
| `platforms` | `linux/amd64` |

Override the Android version at build time with `--build-arg REDROID_TAG=13.0.0_64only-latest`
if needed; the default is `16.0.0_64only-latest`.

## Use

```yaml
image:
  repository: hayone/redroid-etcfix
  tag: 16.0.0
```

## When to drop it

As soon as the cluster runs containerd 2.1.x, or a containerd release that restores
absolute-symlink resolution. Plain `redroid/redroid` works there and needs no fork.

## Caveat unrelated to this fix

An amd64 node cannot run ARM-only APKs. WhatsApp ships `arm64-v8a`/`armeabi-v7a` with no x86
split, so `pm install` returns `INSTALL_FAILED_NO_MATCHING_ABIS`. That needs a translation layer
(libndk / libhoudini), which is not part of the official images.
