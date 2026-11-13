# DSH Mobile Companion

> 🌐 **Idiomas / Languages:** **[English](README.md)** · [Español (México)](README.es.md) · [简体中文](README.zh.md) · [日本語](README.ja.md) · [Português (Brasil)](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

> 🌐 **Language Notice:** This document is translated to make DSH Mobile Companion accessible to international developers. Community language corrections, phrasing improvements, and pull requests are warmly welcome. The canonical reference document is in [Español (México)](README.es.md).

Mobile access to DeepSeek Harness over a ZeroTier or Tailscale private network, without opening ports and without breaking prompt caching.

The mobile app does not reimplement the interface: it renders DeepSeek Harness's own Web GUI and applies a touch-friendly adjustment. What you see on your phone is the exact same product running on your computer.

Hardened edition by Ismael Muñoz Reyes for Tinta y Nodos.

---

## What it solves

DeepSeek Harness listens on `127.0.0.1` and protects its sessions with an HMAC cookie derived from `.credentials.yaml`. That is why opening a port or using a generic tunnel is not enough: without that cookie, the interface responds with 401, and carelessly rewriting request origins breaks the stable prefix required for prompt caching.

This project solves all three problems at once:

- **Transparent session signing.** The bridge reads the local secret, generates the HMAC-SHA256 cookie (version 1), and renews it before expiration. The mobile browser never sees the secret.
- **Touch adjustment on the real product.** Viewport metadata and a minimal stylesheet are injected. The interface is not replaced, and no JavaScript is injected into the document.
- **Network isolation.** The socket binds exclusively to the VPN interface and only accepts clients originating from that same private network.

---

## Architecture

```text
Phone (ZeroTier / Tailscale network)
        |
        v
bridge.mjs  —exclusive bind to VPN IP—
   |-- /                      proxy to DeepSeek Harness + mobile adjustment
   |-- /offline               standby page when Harness is not yet responding
   |-- /dsh-companion/status  link discovery and health check
   |-- /dsh-companion/sync    conversation dump to disk
        |
        v
127.0.0.1:52710  DeepSeek Harness
```

Modules:

```text
companion/
├── bridge.mjs              startup, routing, socket and access policies
├── offline.html            standby screen matching the product aesthetic
├── manifest.webmanifest    installation as a web application
├── icon.svg
├── android_src/
│   └── MainActivity.java   native client: hardened WebView, pill indicator, reconnection
├── test/
│   ├── verify_bridge.mjs      routes, injection, origin, framing, limits
│   ├── verify_sync_ws.mjs     content sanitization and WebSocket handshake
│   └── verify_access_key.mjs  shared-key access control
├── src/
│   ├── config.mjs          centralized configuration and limits
│   ├── log.mjs             timestamped logger
│   ├── network.mjs         VPN discovery, authorization, Harness port
│   ├── crypto.mjs          secret, HMAC v1 cookie, access key, constant-time comparison
│   ├── http.mjs            header sanitization, bounded body, trusted origin
│   ├── proxy.mjs           HTTP proxy and WebSocket tunnel
│   ├── mobile.mjs          viewport injection and touch adjustments
│   ├── sync.mjs            atomic conversation persistence
│   ├── static.mjs          local assets with ETag
│   └── ratelimit.mjs       per-client token bucket
└── synced_chats/           persisted conversations (.md and .json)
```

---

## Installation

### Method 1: Automated Setup with your AI Assistant (Recommended)

If you use an AI agent or coding assistant on your machine (DeepSeek Harness, Cursor, Claude Code, Copilot, etc.), copy and paste the prompt below into your chat. The AI will autonomously clone, configure background startup, verify the bridge, and provide you with simple mobile connection steps:

> Full guide: [AI_SETUP_PROMPT.md](AI_SETUP_PROMPT.md)

```text
Act as a technical setup assistant on this machine.
Your objective is to install, activate, verify, and completely configure "DSH Mobile Companion" (a secure companion bridge providing mobile access to DeepSeek Harness over a private ZeroTier or Tailscale network), and provide me with clear, jargon-free instructions to connect my phone.

Follow these steps autonomously and in order:
1. Verify "%USERPROFILE%\.dsh" and locate Node.js (in PATH or in "%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe").
2. If not already inside the directory, clone: git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
3. Configure silent startup with "install-autostart.bat" and start the service with "run-hidden.vbs".
4. Query http://127.0.0.1:57420/dsh-companion/status to verify the bridge responds 200 and report DSH status.
5. Provide a simple, jargon-free summary with: the URL for my phone (http://<VPN_IP>:57420), the APK download link in GitHub Releases, and how to authorize my phone at http://127.0.0.1:57420/pair.
```

### Method 2: Manual Installation

#### Computer

```bash
git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
```

1. Set an access key (strongly recommended, see below).
2. Install automatic startup with `install-autostart.bat` (registers a silent task on Windows startup).
3. The bridge automatically detects the ZeroTier or Tailscale interface and binds to it. If detection fails, set `DSH_BIND_HOST` to your private IP.

### Phone

Two equivalent methods:

- **Native application:** install `DSH-Companion.apk` from the *Releases* section. Provides automatic reconnection, bunker selector, and full screen. Weighs less than 160 KB and includes zero third-party dependencies: pure, reproducible Java client code, asset icon, and theme.
- **Without installing anything:** open `http://<VPN_IP>:57420` in your browser and select "Add to Home screen".

`/m` responds with a permanent redirect to `/`: the previous satellite mode was retired in favor of the real interface.

---

## Environment Variables

| Variable | Default Value | Usage |
| --- | --- | --- |
| `DSH_BIND_HOST` | auto-detected | Forces the private bind IP |
| `DSH_TARGET_PORT` | `52710` | DeepSeek Harness port |
| `DSH_LISTEN_PORT` | `57420` | Bridge listen port |
| `DSH_HOME` | `%USERPROFILE%\.dsh` | Credentials and key directory |
| `DSH_BROWSER_SECRET` | — | Direct secret, avoids reading YAML |
| `DSH_ACCESS_KEY` | auto-generated | Shared key; overrides file-based key |
| `DSH_ACCESS_DISABLE` | — | `1` disables access key (loopback bind only) |
| `DSH_COMPANION_TOKEN` | empty | Additional token for `/dsh-companion/sync` |
| `DSH_ALLOW_CIDR` | empty | Additional authorized subnets, comma-separated |

### One-time approval from the computer

No key needs to be entered.

1. Open the app on your phone. It displays "Confirm on your computer".
2. On your PC, open `http://<VPN_IP>:57420/pair`.
3. The device appears with its IP address. Click **Authorize**.
4. The phone connects automatically and will not prompt again.

The session lasts **30 days and renews with use**: each time you open the app after 24 hours, the counter resets to 30. If you use it at least once a month, it never expires.

The pairing panel listens **strictly on 127.0.0.1** and requires its own credential, making it unreachable from the VPN or external machines. It displays authorized devices with an individual revocation control.

Authorized devices are stored in `%USERPROFILE%\.dsh\companion-devices.json`. A **Revoke all** action is available in the panel. Details in [DISPOSITIVOS.md](DISPOSITIVOS.md).

The manual access key remains available as a fallback for standard browser access at `%USERPROFILE%\.dsh\companion-access-key`. The native app does not require it.

**Practical limitation:** HTTP Basic transmits the key in Base64 without transport-layer encryption of its own. This is acceptable only because ZeroTier and Tailscale encrypt all transit end-to-end. On a shared or public ZeroTier network, an adversarial peer could attempt Layer 2 interception; the proper defense is keeping the network strictly private with manual node authorization.

---

## Routes

- `GET /` — DeepSeek Harness Web GUI, with mobile viewport adjustments applied when the client is a phone.
- `GET /offline` — Standby page while Harness is starting up, featuring an Offline Editorial Reader for preloaded sessions.
- `GET /dsh-companion/status` — `{ service, version, status, dshOnline, targetPort, time }`.
- `POST /dsh-companion/sync` — Saves a conversation to `synced_chats/` in Markdown and structured JSON formats.
- `GET /dsh-companion/chats` — Chronological list of synchronized sessions for offline reading.
- `GET /dsh-companion/chat/:id` — Returns session contents (structured JSON, or raw Markdown with `?format=md`).
- `POST /dsh-companion/action` — Remote background resolution for tool authorizations and sandbox permission prompts.
- `GET /companion.webmanifest` — PWA installation manifest.

---

## Security Model

**Access**

- Mandatory shared key via HTTP Basic on all routes, including discovery; evaluated via constant-time comparison and rate-limited per IP.
- Strict client authorization: local loopback, the bind interface subnet **with its actual netmask**, or explicitly declared CIDRs.
- `Host` header validation matching the bridge address: mitigates DNS rebinding.
- Rejection of `Origin: null`, empty origin, and `Sec-Fetch-Site` values other than `same-origin`/`none`.
- Immediate rejection of requests containing simultaneous `Content-Length` and `Transfer-Encoding` (request smuggling protection).
- Access keys and client authorization tokens are stripped prior to proxying to the backend.
- WebSocket tunnel enforced with identical origin validation, CRLF sanitization, and graceful termination.

**Credentials**

- The session secret is read once, never logged, and never transmitted to the client. Validated at startup: if missing, the process fails fast instead of leaving incoming requests hanging.
- Version 1 HMAC-SHA256 cookie, identical to the token issued by DeepSeek Harness, with 12 hours of validity and proactive renewal.
- If the backend returns 401, the bridge reloads the secret and retries once: gracefully handles `.credentials.yaml` rotation without restarting.

**Data and storage**

- Synchronized conversations are written atomically with sanitized identifiers and strict path confinement validation against directory traversal.
- All content is escaped prior to serialization: no executable HTML leaks into exported files or indexes.
- Explicit enforcement of body size limits, message counts, and per-message length ceilings.
- In-memory rate limiting with a bounded ceiling: immune to memory exhaustion attacks via unique keys.

**Native Application (Android)**

- `DSH-Companion.apk` — version 4.4.0, `versionCode` 21, `minSdk` 26, `targetSdk` 35.
- Sub-240 KB footprint without AndroidX or Kotlin: `classes.dex` is clean, reproducible pure Java bytecode.
- **Dynamic Multi-PC support:** Add, configure, and switch across unlimited computers with intelligent selector and secure removal.
- **Background notification actions:** Approve or deny tool executions and `danger-full-access` permission requests directly from the Android notification shade without opening the app window.
- **Offline editorial reader:** Read synchronized sessions on the phone with book-grade typography optimized for narrative pacing and chapters, even when the host PC is powered off.
- **Sober engineering design:** Console-grade visual hierarchy with zero distracting emojis, adhering to official DeepSeek and GitHub Dark palettes.
- Local file access disabled, mixed content blocked, popups and remote debugging disabled.
- Microphone access is strictly restricted to the bunker's exact origin (scheme, host, and port); all other origins are denied.
- Navigation strictly confined to the bunker origin; external links delegate to the native system chooser.
- TLS errors terminate navigation immediately without exception.
- Navigation aborts (`ERR_ABORTED`) are distinguished from transport dropouts, eliminating infinite reload loops.
- Reconnection attempts pause when the application is backgrounded and apply exponential backoff with jitter.

---

## Testing

```bash
node test/verify_bridge.mjs
node test/verify_sync_ws.mjs
node test/verify_access_key.mjs   # requires DSH_ACCESS_KEY defined at startup
```

Covers discovery, mobile injection, compliance with `?dshc=off`, cross-origin rejection, request smuggling defenses, body limits, content sanitization, WebSocket handshake integrity, and access control.

---

## Honest Limitations

This design is intended for **personal use**: one operator, their trusted devices, and their private network. It is not a multi-tenant service.

- The bridge grants full access to the DeepSeek Harness session of the underlying Windows user account. There is no multi-user or per-device privilege separation.
- Multiple devices belonging to the same user share the active session, though each device is authorized and revoked individually via the pairing panel.
- There are no user accounts or role-based access control (RBAC): anyone with an authorized device controls the session.
- The pairing panel logs recent activity for operational visibility, but it is not an immutable audit ledger: it can be cleared with a single button.
- A public or shared ZeroTier network voids the private network perimeter. Keep networks private with manual node authorization at my.zerotier.com.
- A local administrator on the host computer can inspect credentials and conversation logs. This is Windows' security model, not an architectural flaw in the bridge.
- Synchronized chats are stored in plaintext within `synced_chats/`. On Windows, POSIX-style `0600` permissions do not translate to strict ACLs: effective security depends on the Windows User Profile ACL. Encrypt the host volume with BitLocker if the hardware is shared.
- Bridge traffic travels over cleartext HTTP inside the VPN tunnel. This is sound because ZeroTier and Tailscale encrypt all transit end-to-end; never expose the bridge port outside the VPN perimeter.
- Network authorization relies on the client's source IP address. It will not defend against an attacker who has already compromised a node on the same private VPN: `DSH_ACCESS_KEY` is provided to protect against this threat vector.

---

## Community Project Notice

> **Notice:** DSH Mobile Companion is an open-source companion mobile client developed by the community to facilitate secure remote access to DeepSeek Harness over private networks (ZeroTier / Tailscale). It is not an official DeepSeek product, nor is it affiliated with, sponsored by, or endorsed by DeepSeek. All referenced trademarks and logos belong to their respective owners.

## License

BSL 1.1 / PolyForm Noncommercial 1.0.0. Free for individual, educational, and non-commercial use. Commercial redistribution and commercial exploitation are strictly prohibited without express authorization.
Authorship and copyright ownership: Ismael Muñoz Reyes · Tinta y Nodos. See [LICENSE](LICENSE).
