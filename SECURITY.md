# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 5.0.x (current, `versionCode` 38) | Yes |
| 4.5.x and earlier | No |

Only the current release receives security fixes.

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

Every request must present either the shared access key (HTTP Basic, constant time) or a device session cookie obtained through a one-time approval on the host. The device identity is the cookie token, not the source IP, and it expires after 30 days without use. The panel listens only on `127.0.0.1` and is entered with a single-use ticket. The kill switch revokes every device, closes the WebSocket tunnels and rotates the access key. The remote terminal is disabled unless `DSH_ENABLE_TERMINAL=1`, and even then it only accepts loopback. The Android client stores keys encrypted with the Android Keystore and refuses cleartext traffic to anything that is not the configured bunker or a private address.
