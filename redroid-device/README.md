# redroid-device

redroid that presents itself as a normal retail Android device, for apps that refuse to run on a
"custom ROM".

## The problem, measured

Stock redroid announces exactly what it is. From a running instance:

| property | value |
|---|---|
| `ro.product.brand` | `redroid` |
| `ro.product.manufacturer` | `redroid` |
| `ro.product.model` | `redroid13_arm64_only` |
| `ro.build.fingerprint` | `redroid/redroid_arm64_only/…:userdebug/test-keys` |
| `ro.build.tags` | `test-keys` |
| `ro.build.type` | `userdebug` |
| `ro.debuggable` | `1` |

Those strings appear in three files — `/system/build.prop`, `/vendor/build.prop`,
`/odm/etc/build.prop` — and in the per-partition `ro.product.<partition>.*` form that Android
derives `ro.product.*` from. This image rewrites all of them and nothing else.

## What it will and will not fix

**Will help:** string and heuristic checks — "this looks like a custom ROM / emulator".

**Will not help:** Play Integrity or any hardware attestation. Those need a Google-provisioned,
hardware-backed keystore that a container does not have, and no property editing creates one. If
an app demands `MEETS_DEVICE_INTEGRITY`, this image will not satisfy it and nothing else will
either on redroid.

Worth knowing: redroid ships **no GMS at all** (zero Google packages), so an app cannot even call
the Play Integrity API here. That makes a string-based check the more likely cause of a rejection,
which is why this is worth trying — but it is a hypothesis, not a guarantee.

Two signals stay visible regardless:

- **SELinux reports `Disabled`** — redroid runs with it off.
- **adb is enabled and unauthenticated** — ws-scrcpy and all provisioning depend on it. Setting
  `ro.adb.secure=1` would hide it and break both.

## The trap

Do **not** blanket-replace `redroid` across `build.prop`. `ro.hardware=redroid` is load bearing:
init resolves `init.<hardware>.rc` from it, so changing it means the instance never boots. Only the
identity keys are rewritten; the build prints any surviving `redroid` references so you can confirm
`ro.hardware` is still among them.

## Build

Actions → **Build and Push Docker Image**

| input | value |
|---|---|
| `image_folder` | `redroid-device` |
| `version_tag` | `13.0.0` |
| `platforms` | `linux/arm64` |

**Use a fingerprint from a real device you own.** On that phone:

```bash
adb shell getprop ro.build.fingerprint
adb shell getprop ro.product.model
adb shell getprop ro.product.device
```

then pass them as build args. The defaults in the Dockerfile are an example shape, not a real
build — and a fingerprint that matches no real device is *more* suspicious than redroid's own, not
less. Keep the Android version in the fingerprint equal to `REDROID_TAG`.

## Use

```yaml
# cluster-upstream/apps/redroid/base/values.yaml
image:
  repository: hayone/redroid-device
  tag: 13.0.0
```

## Verify after deploying

```bash
kubectl exec redroid-0 -n apps -- getprop ro.product.manufacturer   # expect the spoofed brand
kubectl exec redroid-0 -n apps -- getprop ro.build.tags             # expect release-keys
kubectl exec redroid-0 -n apps -- getprop ro.hardware               # MUST still be redroid
kubectl exec redroid-0 -n apps -- getprop sys.boot_completed        # 1
```

If `sys.boot_completed` never reaches 1, check the **host** kmsg (`sudo dmesg -T | grep init:`),
not `kubectl logs` — redroid's init writes there.

## A caution worth stating

Messaging providers ban accounts they believe are automated or running on tampered devices, and a
ban costs the number, not just the session. Spoofing device identity raises that risk rather than
lowering it. If the goal is WhatsApp automation specifically, the officially supported paths — the
WhatsApp Business Cloud API, or the existing evolution-go multi-device bridge — carry no such risk
and are already in use in this stack.
