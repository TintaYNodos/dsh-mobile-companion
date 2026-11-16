# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 5.1.x (current, `versionCode` 43) | Yes |
| 4.5.x and earlier | No |

Only the current release receives security fixes.

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

- The bridge (`bridge.mjs`, `src/**`): authentication, authorisation, the panel, the proxy, the WebSocket tunnel, the sync endpoints, the notification watcher.
- The Android client (`android_src/**`): WebView hardening, stored credentials, notification handling, cleartext policy.
- The standby page and its assets (`offline*`).

Out of scope:

- Anything that requires an already-compromised host, root, or an attacker who can read the Windows user profile.
- Weaknesses of the underlying VPN (ZeroTier, Tailscale). A public or shared VPN network voids the private perimeter: see "Honest limitations" in the [README](README.md).
- Traffic analysis inside your own VPN: the bridge speaks cleartext HTTP inside the tunnel by design, and the encryption is the tunnel.
- Issues that require the user to install a malicious APK or to hand over their access key.
- Denial of service by someone who already holds a valid device cookie or the access key.

## Security model in one paragraph

Every request must present either the shared access key (HTTP Basic, constant time) or a device session cookie obtained through a one-time approval on the host. The device identity is the cookie token, not the source IP, and it expires after 30 days without use. The panel listens only on `127.0.0.1` and is entered with a single-use ticket. The kill switch revokes every device, closes the WebSocket tunnels and rotates the access key. The Android client stores keys encrypted with the Android Keystore and refuses cleartext traffic to anything that is not the configured bunker or a private address.

## Accepted risks (Riesgos aceptados)

These points from the external audit are deliberate decisions, not pending work. The full
per-point status is in [AUDIT_CLOSURE.md](AUDIT_CLOSURE.md).

| Point | Accepted risk | Why it is accepted | Mitigation in place |
| --- | --- | --- | --- |
| P39 | The home-screen widget receiver is `exported="true"`. | Android requires an exported `AppWidgetProvider` that receives `APPWIDGET_UPDATE`; the launcher is another process. It is inherent to AppWidget. | The receiver takes no external extras and no bridge data: it only reads local `SharedPreferences` and paints `RemoteViews`. No permissions of its own, no tokens, no network. |
| P50 | Some tests assert the injected CSS/markup. | The dependency lives in test code (`verify_injection`, `verify_satellite_and_battery`), never in a production authorization or sanitization path. | If DeepSeek Harness changes its markup, the suite fails loudly instead of silently missing an injection regression. |
| P51 | CSP is applied only to the bridge's own pages and static assets, not to proxied DeepSeek Harness HTML. | Rewriting a third-party app's headers would break it; the proxied response is same-origin authenticated and keeps DSH's own headers. | Own pages get CSP, `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`; the proxy does not strip the upstream security headers. |
| P56 | There is no linter (ESLint or equivalent). | The project has zero npm dependencies on purpose; adding a linter would add a toolchain and a supply chain for no runtime benefit. | `tools/audit-repo.mjs` (syntax, encoding, links, tables, JSON, versions, secrets, 400-line limit) runs in CI; every module also passes `node --check`. |

P22 y P2 quedaron cerrados en 5.1.9: el descubrimiento exige identidad real de DSH y la prueba del
registro ya no puede corromper el registro real del usuario. Los cuatro puntos aceptados de arriba
mantienen su mitigación; el detalle punto por punto y la evidencia están en
[AUDIT_CLOSURE.md](AUDIT_CLOSURE.md).
