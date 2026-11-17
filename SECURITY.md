# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 5.2.10 (current, `versionCode` 54) | Yes — security fixes only |
| 5.2.8 and earlier | No (previous builds) |

5.2.10 is the current stable version of the 5.2 series.

## Verifying a build

Only install APKs whose signature matches the release certificate:

```bash
apksigner verify --print-certs DSH-Companion.apk
```

Release certificate SHA-256: `4F:E1:AD:C0:45:71:AF:2B:89:1B:E4:6B:1B:3C:86:39:65:F6:73:A6:B7:25:87:61:47:96:91:7F:49:63:65:23`

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately:

- Open a **private security advisory** at
  `https://github.com/TintaYNodos/dsh-mobile-companion/security/advisories/new`
  (GitHub → *Security* → *Report a vulnerability*), or
- Email **seguridad@tintaynodos.dev** with the subject `DSH Companion security`.

Include, when possible:

1. Affected version (`/dsh-companion/status` shows it) and platform.
2. The smallest reproduction you can build: request, payload, expected and observed result.
3. Whether the bridge was bound to loopback, a LAN or a VPN interface, and whether the client was authorised.
4. Any log line from `bridge.log` that shows the behaviour (the file never contains the full access key).

### What to expect

- Acknowledgement within **72 hours**.
- An initial assessment within **7 days**.
- A fix or a documented mitigation, and credit in the release notes if you want it.

We will not take legal action against researchers who act in good faith, test only on their own installation, do not access other people's data, and give us reasonable time before public disclosure. See the Safe Harbor section of [CONTRIBUTING.md](CONTRIBUTING.md).

## Scope

In scope:

- The bridge (`bridge.mjs`, `src/**`): authentication, authorisation, the panel, the proxy, the WebSocket tunnel, the sync endpoints, the notification watcher, the phone-notes endpoint and the received-notes inbox.
- The Android client (`android_src/**`): WebView hardening, stored credentials, notification handling, cleartext policy, the encrypted notes store.
- The standby page and its assets (`offline*`).

Out of scope:

- Anything that requires an already-compromised host, root, or an attacker who can read the Windows user profile.
- Weaknesses of the underlying VPN (ZeroTier, Tailscale). A public or shared VPN network voids the private perimeter: see "Honest limitations" in the [README](README.md).
- Traffic analysis inside your own VPN: the bridge speaks cleartext HTTP inside the tunnel by design, and the encryption is the tunnel.
- Issues that require the user to install a malicious APK or to hand over their access key.
- Denial of service by someone who already holds a valid device cookie or the access key.

## Security model in one paragraph

Every request must present either the shared access key (HTTP Basic, constant time) or a device session cookie obtained through a one-time approval on the host. The device identity is the cookie token, not the source IP, and it expires after 30 days without use. The panel listens only on `127.0.0.1` and is entered with a single-use ticket. The kill switch revokes every device, closes the WebSocket tunnels and rotates the access key. The Android client stores keys encrypted with the Android Keystore and refuses cleartext traffic to anything that is not the configured bunker or a private address.

## Local notes (privacy)

Notes are the only content created on the phone itself, so their protection is local first.

- **Encrypted at rest.** `notes.json` is written as `MAGIC + IV + ciphertext` using **AES-256-GCM**
  with a key held in the **AndroidKeyStore**; the IV is random per write and the GCM tag rejects a
  tampered file. A plaintext file from an earlier version is migrated to the encrypted format the
  first time it is read, and a file that cannot be decrypted is kept aside as `notes.json.corrupt`
  instead of being destroyed.
- **FLAG_SECURE on the Notes screen.** Screenshots are blocked and the system does not draw note
  thumbnails in the recent-apps switcher, so a borrowed or lost phone does not leak the notes.
- **"Solo en el teléfono" (local only).** A note marked this way is never sent: it is excluded from
  "Send all", it is not serialized in the request payload, and sharing it asks for confirmation.
- **No Internet egress.** Notes need no account, no API key and no external service; the app does
  not send note content anywhere except the explicit **Send to PC**, which goes to the bridge over
  the private network using the existing device cookie.
- **Idempotent send.** The payload carries the note `id`; the bridge keeps an `id` to file index
  (`ids.json`) and updates the same `.md` file on a resend, so a retry never creates duplicates. The
  front matter keeps `id`, `dueDate` and `updatedAt`; the retired `chatTarget` field is ignored even
  if it arrives.
- **Bounded and authenticated.** `POST /dsh-companion/notes` requires a paired device with the
  `full` role or the access key (a `viewer` is read-only), caps the body at 64 KB, requires
  `Content-Type: application/json` and sanitizes every metadata field. `GET /dsh-companion/notes`
  returns metadata only (never note bodies) and is also available to a `viewer`.

## Accepted risks (Riesgos aceptados)

These points from the external audit are deliberate decisions, not pending work. The full
per-point status is in [AUDIT_CLOSURE.md](AUDIT_CLOSURE.md).

| Point | Accepted risk | Why it is accepted | Mitigation in place |
| --- | --- | --- | --- |
| P39 | The home-screen widget receiver is `exported="true"`. | Android requires an exported `AppWidgetProvider` that receives `APPWIDGET_UPDATE`; the launcher is another process. It is inherent to AppWidget. | The receiver takes no external extras and no bridge data: it only reads local `SharedPreferences` and paints `RemoteViews`. No permissions of its own, no tokens, no network. |
| P50 | Some tests assert the injected CSS/markup. | The dependency lives in test code (`verify_injection`), never in a production authorization or sanitization path. | If DeepSeek Harness changes its markup, the suite fails loudly instead of silently missing an injection regression. |
| P51 | CSP is applied only to the bridge's own pages and static assets, not to proxied DeepSeek Harness HTML. | Rewriting a third-party app's headers would break it; the proxied response is same-origin authenticated and keeps DSH's own headers. | Own pages get CSP, `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`; the proxy does not strip the upstream security headers. |
| P56 | There is no linter (ESLint or equivalent). | The project has zero npm dependencies on purpose; adding a linter would add a toolchain and a supply chain for no runtime benefit. | `tools/audit-repo.mjs` (syntax, encoding, links, tables, JSON, versions, secrets, 400-line limit) runs in CI; every module also passes `node --check`. |

P22 y P2 quedaron cerrados en 5.1.9: el descubrimiento exige identidad real de DSH y la prueba del
registro ya no puede corromper el registro real del usuario. Los cuatro puntos aceptados de arriba
mantienen su mitigación; el detalle punto por punto y la evidencia están en
[AUDIT_CLOSURE.md](AUDIT_CLOSURE.md).

## APK permissions (5.2.10 review)

Every permission declared in `android_src/AndroidManifest.xml` was checked against real code use in
5.2.10. Nothing was removed that the client actually needs, and nothing is requested "just in case"
at install time.

| Permission | Real use | Decision |
| --- | --- | --- |
| `INTERNET` | WebView traffic to the bridge and the bridge's own update checks. | Keep. |
| `ACCESS_NETWORK_STATE` | Detect connectivity loss in `ConnectionController` and `Cleanup` to show the offline/standby page instead of a blank error. | Keep. |
| `RECORD_AUDIO` | `CompanionChromeClient.onPermissionRequest` only for the **same-origin bunker** frame when the page asks for `RESOURCE_AUDIO_CAPTURE`; a cross-origin frame is denied. It powers the WebView's audio capture (voice input) without granting anything else. | Keep: removing it would silently break audio capture in the proxied GUI. It is never requested at startup; the system dialog appears only when the page asks. |
| `POST_NOTIFICATIONS` | PC-event notifications. Requested once from `MainActivity` on Android 13+. | Keep. |
| `VIBRATE` | Haptic feedback of the mobile key bar, approval results and the kill switch. | Keep. |
| `REQUEST_INSTALL_PACKAGES` | In-app update: `UpdateInstaller` verifies the SHA-256 anchor when the release publishes one (GitHub asset `digest`) or when the bridge publishes `apkSha256` in `/status`. A legacy bridge that does not publish `apkSha256` falls back to Android's own signature check (same signing key required) and is flagged as unanchored. | Keep; installation still needs the user's confirmation. |
| `USE_BIOMETRIC` + `USE_FINGERPRINT` | `BiometricGate` for critical approvals. `USE_FINGERPRINT` is the legacy alias required on API 26–27. | Keep for Android 8.0 compatibility. |
| `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_DATA_SYNC` | The PC-event watcher runs in a `dataSync` foreground service while notifications are enabled. | Keep. |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | `SettingsNotifications.requestBatteryExemption` is called **only** when the user turns on the "Permitir en segundo plano" switch after enabling notifications; it is never requested on launch. | Keep: the switch is opt-in and the request is tied to it. |
| `RECEIVE_BOOT_COMPLETED` | `BootReceiver` restarts the notification service after a reboot, only if the user left notifications and the watchdog enabled. | Keep. |

The manifest `versionCode` only increases when a release is published; the machine-readable record
of each published build (version, commit, APK SHA-256, certificate fingerprint, date) lives in
[RELEASES.json](RELEASES.json).
