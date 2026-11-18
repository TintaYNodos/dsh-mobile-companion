# DSH Mobile Companion

![version](https://img.shields.io/badge/version-5.4.0-1f6feb?style=flat-square) ![license](https://img.shields.io/badge/license-BUSL--1.1-8b5cf6?style=flat-square) ![android](https://img.shields.io/badge/Android-8.0%2B-3ddc84?style=flat-square&logo=android&logoColor=white) ![node](https://img.shields.io/badge/Node-22.15%2B-339933?style=flat-square&logo=node.js&logoColor=white) ![ci](https://github.com/TintaYNodos/dsh-mobile-companion/actions/workflows/verify.yml/badge.svg?branch=main) ![tests](https://img.shields.io/badge/tests-373%2B%20checks-2ea043?style=flat-square) ![size](https://img.shields.io/badge/282%20KB-0ea5e9?style=flat-square) ![agent-ready](https://img.shields.io/badge/agent--ready-doctor.ps1%20--json-6f42c1?style=flat-square)

> 🌐 **Idiomas / Languages:** **[English](README.md)** · [Español (México)](README.es.md) · [简体中文](README.zh.md) · [日本語](README.ja.md) · [Português (Brasil)](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

> 🌐 **Language Notice:** This document is translated to make DSH Mobile Companion accessible to international developers. Community language corrections, phrasing improvements, and pull requests are warmly welcome. The canonical reference document is in [Español (México)](README.es.md).

Mobile access to DeepSeek Harness over a ZeroTier or Tailscale private network, without opening ports and without breaking prompt caching.

The mobile app does not reimplement the interface: it renders DeepSeek Harness's own Web GUI and adds a touch layer. What you see on your phone is the same product running on your computer.

Hardened edition by Ismael Muñoz Reyes for Tinta y Nodos.

Current version: **5.4.0** (bridge and APK, `versionCode` 66).

**New in 5.4.0:**

- Configurable quick commands and code keys per profile, a composer capped at 35% of the visible
  height and a compact 44 dp dock in landscape.
- Full-screen "no connection" screen, a QR dialog with a selectable manual fallback, and a
  scrollable Hub that closes by dragging.
- The offline chat copy is **off by default** (opt-in in Settings); the app can read the last
  saved chat with the PC off.
- Notes: `synced_chats/notes/INDICE.md` index for agents, fixed resend, "Copy for chat",
  per-client rate limit and automatic repair of broken text encoding.
- Multi-PC: the kill switch affects **only the active PC**; the APK anchor is resolved from the
  repository root and `/status` no longer blocks.

---

## What it solves

DeepSeek Harness listens on `127.0.0.1` and protects its sessions with an HMAC cookie derived from `.credentials.yaml`. That is why opening a port or using a generic tunnel is not enough: without that cookie the interface answers 401, and carelessly rewriting request origins breaks the stable prefix required for prompt caching.

This project solves all three problems at once:

- **Transparent session signing.** The bridge reads the local secret, generates the HMAC-SHA256 cookie (version 1) and renews it before expiration. The mobile browser never sees the secret.
- **Touch layer on the real product.** Viewport metadata, a stylesheet and a small client script are injected. The interface is not replaced: the script only adds touch affordances (command dock, code keys, theme sync, approval relay, notification relay). It runs with the same origin and privileges as the page, so treat it as part of the trust boundary.
- **Network isolation.** The socket binds exclusively to the VPN interface and only accepts clients originating from that same private network.

---

## Architecture

```text
Phone (ZeroTier / Tailscale network)
        |
        v
bridge.mjs  —exclusive bind to the VPN IP—
   |-- /                        proxy to DeepSeek Harness + touch layer
   |-- /offline                 standby page and offline editorial reader
   |-- /dsh-companion/status    link discovery and health check
   |-- /dsh-companion/sync      conversation dump to disk
   |-- /dsh-companion/chats     synchronized conversation index
   |-- /dsh-companion/pc-events Server-Sent Events: "a turn just finished"
   |-- /dsh-companion/pair-*    device pairing and approval
        |
        v
127.0.0.1:<harness port>  DeepSeek Harness
```

Modules:

```text
companion/
├── bridge.mjs                 startup, routing, socket and access policies
├── package.json               single source of version, `npm start` / `npm test`
├── offline.html               standby screen shell
├── offline.css                base layout, themes and tabs
├── offline-reader.css         editorial reader and conversation detail
├── offline-core.js            shared state, connection status, navigation
├── offline-reader.js          offline reader, list, detail, reading modes
├── src/
│   ├── config.mjs             centralized configuration and limits
│   ├── log.mjs                timestamped logger
│   ├── network.mjs            VPN discovery, authorization, Harness port
│   ├── crypto.mjs             secret, HMAC v1 cookie, access key, rotation
│   ├── http.mjs               header sanitization, bounded body, trusted origin
│   ├── routes.mjs             route dispatch (state, data, control)
│   ├── routes-pairing.mjs     pairing, approval, panel hand-off
│   ├── panel.mjs              local approval panel (loopback only)
│   ├── pairing.mjs            pending requests and codes
│   ├── pairing-views.mjs      panel HTML
│   ├── devices.mjs            device registry, TTL, revocation
│   ├── registry.mjs           atomic, crash-safe JSON registry
│   ├── proxy.mjs              HTTP proxy
│   ├── proxy-ws.mjs           WebSocket tunnel
│   ├── mobile.mjs             injection entry (viewport + client script)
│   ├── mobile-client*.mjs     injected client, split by responsibility
│   ├── mobile-styles.mjs      injected stylesheet
│   ├── pc-events.mjs          session turn watcher -> SSE notifications
│   ├── sync.mjs               atomic conversation persistence
│   ├── static.mjs             local assets with ETag
│   ├── system-stats.mjs       CPU, memory and temperature telemetry
│   ├── qr.mjs / visual-lab.mjs helpers for the QR and visual harnesses
│   └── ratelimit.mjs          per-client token bucket
│   ├── device-claim, panel-session, routes-data, sync-format, sync-index, sync-retention
├── android_src/               native client (pure Java, no AndroidX)
│   ├── MainActivity.java      lifecycle and orchestration
│   ├── CompanionWebViewClient.java, CompanionChromeClient.java
│   ├── CleartextPolicy.java   blocks cleartext to non-private hosts
│   ├── PcRegistryStore.java, PcEntry.java   multi-PC registry
│   ├── SettingsScreen.java, HubSheet.java, PcDialogs.java, QrDialogs.java
│   ├── UpdateInstaller.java, KillSwitchUi.java, BiometricGate.java
│   ├── PcEventsService.java   foreground service for PC notifications
│   ├── NotificationHelper.java, NotificationChannels.java, NotificationsPc.java
│   ├── KeyStoreVault.java    Android Keystore encryption for stored keys
│   └── …                     discovery, telemetry, local notes, WOL, widget
├── test/
│   ├── verify_*.mjs           seventeen verification suites (373+ checks in CI)
│   ├── _harness.mjs           shared client
│   └── run-all.mjs            `npm test`
├── tools/
│   └── audit-repo.mjs         repository audit (text, syntax, versions, secrets)
├── build-apk.ps1              builds and signs the APK without Gradle
├── doctor.ps1                  install diagnostic (Node, tunnel, bridge, panel)
├── RELEASING.md               release checklist
├── .github/workflows/verify.yml   CI: syntax + audit on every push
├── SECURITY.md                how to report a vulnerability
├── CHANGELOG.md               version history
└── synced_chats/              persisted conversations (.md and .json)
```

---

## Installation

### Method 1: automated setup with your AI assistant (recommended)

If you use an AI agent or coding assistant on your machine (DeepSeek Harness, Cursor, Claude Code, Copilot, etc.), paste the prompt below into your chat. The assistant will clone, configure background startup, verify the bridge and hand you the mobile connection steps.

> Full guide: [AI_SETUP_PROMPT.md](AI_SETUP_PROMPT.md)

> Free private-network options, honestly compared (what the bridge detects and what it does not): [VPN_OPTIONS.md](VPN_OPTIONS.md)

> The assistant must run `doctor.ps1` first and stop if there is no private tunnel.

```text
You are a setup assistant. First run the diagnostic and paste its output:

    powershell -ExecutionPolicy Bypass -File doctor.ps1

If it reports NO TUNNEL (no ZeroTier/Tailscale interface with a private IP), STOP: the phone cannot reach this computer without a private network. Explain how to install ZeroTier (https://my.zerotier.com + client on PC and phone, private network, authorize both nodes) or Tailscale (same account on PC and phone), then run doctor.ps1 again.
If Node is older than 22.15, install Node.js 22. If Harness credentials are missing, open DeepSeek Harness and sign in. If the bridge is down, run install-autostart.bat.
Then: start the bridge (install-autostart.bat registers autostart AND starts it, do not run run-hidden.vbs again), pair the phone with panel.bat (the panel shows the same 4-digit code as the phone), and test notifications with Settings -> Notifications from the PC -> Test from PC.
Finish by running doctor.ps1 again and reporting: tunnel interface and IP, phone URL, bridge version, panel, pairing status and notification test. Never say it works without that evidence. Never expose the bridge to the internet, never print the access key, never run the kill switch unless asked.
```

### Agent-installable skill (DeepSeek Harness)

The full procedure is packaged as a DeepSeek Harness skill in
[skills/mobile-companion-setup](skills/mobile-companion-setup/): an agent loads it and works
through verifiable gates (diagnose, tunnel, bridge, firewall, pairing, notifications, evidence)
instead of improvising. Every `FAIL`/`WARN` from `doctor.ps1` maps to a concrete command in
[doctor-fixes.json](doctor-fixes.json).

Install it in a project skill root, then open a new session:

```powershell
New-Item -ItemType Directory -Force .dsh\skills | Out-Null
cmd /c mklink /J .dsh\skills\mobile-companion-setup skills\mobile-companion-setup
```

The skill appears as `mobile-companion-setup` in the agent's skill catalog and its procedure ends
with an evidence-backed report, not with a "done" without proof.

### Method 2: manual installation

#### Computer

```bash
git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
```

Node.js 22.15 or newer, no npm dependencies. Run `doctor.ps1` to verify the environment (Node, Harness credentials, private tunnel) before starting.

1. Set an access key (strongly recommended; see below).
2. Install automatic startup with `install-autostart.bat`: it registers the silent task **and starts the bridge**. Do not start it again by hand.
3. The bridge detects the ZeroTier or Tailscale interface and binds to it. If detection fails, set `DSH_BIND_HOST` to your private IP.

#### Phone

Two equivalent methods:

- **Native application:** install `DSH-Companion.apk` from the *Releases* section. Multi-PC selector, automatic reconnection, foreground notification service, biometric lock. Zero third-party dependencies: pure, reproducible Java, an asset icon and the theme.
- **Without installing anything:** open `http://<VPN_IP>:57420` in your browser and choose "Add to Home screen".

---

To stop it or remove it from startup: `stop.bat`, `uninstall-autostart.bat` (Windows); `uninstall-launchd.sh`, `uninstall-systemd.sh` (macOS/Linux). The bridge can also be removed by deleting the folder: it keeps nothing outside `%USERPROFILE%\.dsh` and `synced_chats/`.

## Environment variables

| Variable | Default | Effect |
| --- | --- | --- |
| `DSH_BIND_HOST` | auto-detected | Forces the private bind IP |
| `DSH_TARGET_PORT` | auto-detected | DeepSeek Harness port |
| `DSH_LISTEN_PORT` | `57420` | Bridge listen port |
| `DSH_PANEL_PORT` | `57421` | Local approval panel port |
| `DSH_HOME` | `%USERPROFILE%\.dsh` | Credentials, key and registry directory |
| `DSH_BROWSER_SECRET` | — | Secret supplied directly, skips reading the YAML |
| `DSH_ACCESS_KEY` | auto-generated | Shared key; overrides the file-based key |
| `DSH_ACCESS_DISABLE` | — | `1` disables the access key, **only allowed when bound to loopback** |
| `DSH_COMPANION_TOKEN` | empty | Extra token for `/dsh-companion/sync` |
| `DSH_ALLOW_CIDR` | empty | Extra authorized subnets, comma separated |
| `DSH_DEVICE_TTL_DAYS` | `30` | Device session lifetime; expired devices are rejected and purged |
| `DSH_DEVICE_REFRESH_HOURS` | `24` | How often the lifetime renews on use |
| `DSH_PENDING_TTL_MIN` | `15` | Minutes a pairing request waits for approval |
| `DSH_ALLOWED_HOSTS` | empty | Extra host names accepted in `Host`/`Origin` (Tailscale MagicDNS) |
| `DSH_ALLOW_GENERIC_VPN` | — | `1` accepts a generic tun/tap interface as the private network |
| `DSH_SYNC_MAX_FILES` | `200` | Maximum number of synchronized conversations kept |
| `DSH_SYNC_MAX_TOTAL_MB` | `200` | Maximum size of `synced_chats/` in MB |
| `DSH_LOG_MAX_MB` | `5` | Maximum size of `bridge.log` in MB before rotating (minimum 1) |
| `DSH_LOG_KEEP` | `3` | Rotated `bridge.log.N` files kept (1–10) |
| `DSH_VPN_IP` | auto | Forces the private IP when the adapter name is unknown |
| `DSH_ALLOW_PROXY_ACCESS` | — | `1` accepts proxy headers (only with an identity layer in front) |
| `DSH_PANEL_TOKEN` | auto | Single-use ticket to open the local panel |
| `DSH_VISUAL_URL` | `http://127.0.0.1:57420` | URL used by the capture probe `visual-lab` |

### One-time approval from the computer

1. Open the app on your phone: it shows "Confirm on your computer".
2. On your PC run `panel.bat` (or open the URL the bridge prints). The panel listens **strictly on 127.0.0.1**.
3. The device appears with its code and address. Press **Authorize**.
4. The phone connects and will not ask again.

The device session lasts **30 days and renews on use**: each time the app is opened after 24 hours the counter resets. Expired devices are no longer accepted and are removed from the registry.

Panel entry is a **single-use ticket** that expires and dies when redeemed; in exchange the browser gets an `HttpOnly`, `SameSite=Strict` session cookie whose identifier only exists in memory. No token travels in a URL you can share, and nothing is written to a file with the permanent credential.

Authorized devices live in `%USERPROFILE%\.dsh\companion-devices.json`. The panel offers individual revocation and **Revoke all**. On the phone, the **Kill switch** revokes every device, closes the WebSocket tunnels **and rotates the access key**. Details in [DISPOSITIVOS.md](DISPOSITIVOS.md).

The manual access key remains available as a fallback for standard browser access, stored at `%USERPROFILE%\.dsh\companion-access-key`. The native app keeps it encrypted with the Android Keystore.

**Practical limitation:** HTTP Basic transmits the key in Base64 without transport-layer encryption of its own. This is acceptable only because ZeroTier and Tailscale encrypt all transit end-to-end. On a shared or public ZeroTier network an adversarial peer could attempt Layer 2 interception; keep the network strictly private with manual node authorization.

---

## Routes

- `GET /` — DeepSeek Harness Web GUI, with the touch layer applied when the client is a phone.
- `GET /offline` — standby page while Harness starts, plus the offline editorial reader.
- `GET /dsh-companion/status` — `{ service, version, status, dshOnline, targetPort, apkVersion, apkVersionCode, requestAttempts, time }`. Anonymous callers get this minimal shape; `apkSha256`, device list, pending list and telemetry require authorization.
- `POST /dsh-companion/sync` — saves a conversation to `synced_chats/` as Markdown and JSON.
- `POST /dsh-companion/notes` — saves a note sent from the phone as Markdown in `synced_chats/notes/`; with an `id`, resending it updates the same file (idempotent).
- `GET /dsh-companion/notes` — metadata of the received notes (no bodies) for the panel inbox.
- `GET /dsh-companion/chats` — index of synchronized conversations.
- `GET /dsh-companion/chat/:id` — conversation contents (JSON, or Markdown with `?format=md`).
- `GET /dsh-companion/pc-events` — Server-Sent Events stream that emits `response-finished` when a turn ends on the computer.
- `POST /dsh-companion/pc-events/test` — emits a synthetic event; used by the "Test from PC" button.
- `GET /dsh-companion/pair-state` — polling endpoint used by the waiting screen.
- `GET /dsh-companion/pair-events` — approval stream for the waiting screen.
- `POST /dsh-companion/open-panel` — opens the local panel window (loopback only).
- `POST /dsh-companion/retry` — clears a rejection and requests access again.
- `POST /dsh-companion/kill-switch` — revokes every device, closes tunnels and rotates the access key.
- `POST /dsh-companion/action` — tool approval relay. Returns `501`: approvals live in the GUI's DOM, the bridge does not fake them.
- `GET /dsh-companion/stats` — host telemetry (authorized).
- `POST /dsh-companion/notification-action` — action from a notification (devices; loopback only).
- `GET /simulator` — mobile interface simulator for development.
- `GET /companion.webmanifest` — PWA manifest.

---

## Health, backups and remote support

- **Real health check.** `/healthz` reports the bridge and DeepSeek Harness separately and returns
  HTTP 503 when Harness is down; a `degraded` status means a piece of the Harness contract changed.
  `/dsh-companion/status` exposes the contract the bridge checked.
- **Backups.** [backup.bat](backup.bat) saves the device registry, the access key and the panel token
  with a hashed manifest; [restore.bat](restore.bat) verifies that manifest before writing and keeps
  a pre-restore copy. Copies live under `%USERPROFILE%\.dsh\backups\`.
- **Remote support (optional).** For hands-on help, [RustDesk](https://rustdesk.com) is a
  recommendation only: it is never bundled and never required. Use a self-hosted server or reach it
  only over ZeroTier/Tailscale, set a strong permanent password plus 2FA, and turn it off when the
  session ends.
- **Runbook.** [OPERACION.md](OPERACION.md) covers approvals, restarts, logs, health, backups and APK
  updates without the computer in front of you; support policy and required evidence:
  [SUPPORT.md](SUPPORT.md).

---

## Mobile client features

- **Command dock and code keys.** A row of composer shortcuts and a row of code symbols that appear only while the keyboard is open, below the composer card when it fits and above it otherwise. Both rows can be toggled in Settings.
- **Enter behaviour.** By default Enter inserts a line break; "Enter sends" flips it. Implemented against Lexical with `execCommand`, which is the only write the composer accepts.
- **PC notifications.** With the foreground service enabled, the phone receives a notification when a turn finishes on the computer **even with the app closed**. The bridge watches the session log and fires on the `turn/end` record: exactly one notification per turn, no matter how long the model or a tool pauses.
- **Foreground notification channel, critical channel, and approval channel.** Critical notices (kill switch result, revoked access) always appear, bypassing the "only when hidden" filter.
- **Biometric gate**, multi-PC selector with QR and manual entry, wake-on-LAN, telemetry pill, local notes (7 area profiles, due dates and a private note mode), system widget.

---

## Security model

**Access**

- Shared key via HTTP Basic on every route, constant-time comparison, rate-limited per IP.
- Strict client authorization: loopback, the bind interface subnet **with its real netmask**, or explicitly declared CIDRs.
- Device identity is the **session cookie token**, not the source IP: a device that inherits an address does not inherit the session.
- `Host` validation against the bridge address (DNS rebinding), rejection of `Origin: null`, empty origin and unexpected `Sec-Fetch-Site`.
- Immediate rejection of `Content-Length` + `Transfer-Encoding` (request smuggling).
- Access keys and client tokens are stripped before proxying to the backend.
- `DSH_ACCESS_DISABLE=1` refuses to start unless the bridge is bound to loopback.
- The access key is **rotated** by the kill switch; everything that was already paired must be approved again.

**Credentials**

- The session secret is read once, never logged and never sent to the client; the process fails fast if it is missing.
- HMAC-SHA256 version 1 cookie identical to the one Harness issues, 12 hours of validity with proactive renewal.
- On backend 401 the bridge reloads the secret and retries once, so a `.credentials.yaml` rotation does not need a restart.
- The access key is never printed in full to the log: only its last four characters.
- The panel has no permanent token: single-use ticket plus in-memory session cookie.
- On Android the stored keys are encrypted with **AES-256-GCM in the Android Keystore**, with automatic migration of older plaintext values.

**Data and storage**

- Conversations are written atomically, with sanitized identifiers and strict path confinement against traversal.
- Content is escaped before serialization: no executable HTML leaks into exported files or indexes.
- Explicit body size limits, message counts and per-message length ceilings.
- In-memory rate limiting with a bounded ceiling.

**Native application (Android)**

- `DSH-Companion.apk` — version **5.4.0**, `versionCode` 66, `minSdk` 26, `targetSdk` 35.
- No AndroidX and no Kotlin: pure Java bytecode; the 5.4.0 APK is 282 KB (288 776 bytes).
- **Cleartext blocked outside the private network**: `CleartextPolicy` rejects any request that is not HTTPS or pointed at the configured bunker or a private/loopback address, and the network security config forbids cleartext to the public services the app talks to (GitHub, for update checks). This is enforced above the WebView, because Android's network security config cannot express "private IP ranges only".
- Local file access disabled, mixed content blocked, popups and remote debugging disabled.
- Microphone access restricted to the bunker's exact origin (scheme, host and port).
- Navigation confined to the bunker origin; external links delegate to the system chooser.
- TLS errors cancel navigation immediately.
- `ERR_ABORTED` is distinguished from transport dropouts, which removes the infinite reload loop.
- `onRenderProcessGone` rebuilds the view instead of letting Android kill the app.
- Reconnection pauses while backgrounded and applies exponential backoff with jitter.
- Approval notifications are hidden from the lock screen (`VISIBILITY_SECRET`) and the approve action refuses to run while the device is locked.

---

## Building the APK

No Gradle, no Android Studio: the APK is assembled with the Android SDK build tools. Requirements: **JDK 17+**, Android SDK with the `android-35` platform and build-tools, and a keystore (the debug one by default).

```powershell
powershell -ExecutionPolicy Bypass -File build-apk.ps1
```

It reads the version from `src/config.mjs`, compiles `android_src/` with `javac`, dexes with
`d8`, injects `classes.dex` and signs with `%USERPROFILE%\.android\debug.keystore` (override with
`-KeyStore`, `-Alias`, `-StorePass`). Details in [RELEASING.md](RELEASING.md).

## APK signature
Release builds are signed with the project release keystore, not the debug one. Verify with:

```bash
apksigner verify --print-certs DSH-Companion.apk
```

Release certificate SHA-256: `4F:E1:AD:C0:45:71:AF:2B:89:1B:E4:6B:1B:3C:86:39:65:F6:73:A6:B7:25:87:61:47:96:91:7F:49:63:65:23`

The 5.1.6 and earlier APKs were signed with the debug certificate. **The signature changed in 5.1.7**: uninstall the previous version once if you come from an older build; from 5.1.7 onwards, updates install over each other normally.

## Testing

```bash
npm test
```


Seventeen suites: **373+ checks in CI** and **865+ Java checks**, covering discovery, mobile injection, `?dshc=off`, cross-origin rejection, request smuggling defences, body limits, content sanitization, WebSocket handshake integrity, registry corruption safety, access control, local notes, device registry TTL, panel flow and the kill switch.

The suite talks to a **live bridge** (it is not a mock): start the bridge first. The real kill-switch run is destructive — it revokes devices and rotates the key — so it is opt-in with `DSH_TEST_DESTRUCTIVE=1`.

---

## Local notes

Notes are stored **only on the phone** and work with the computer off and without Internet. They need
no account, no API key and no connection: create, edit and delete them in the app, and share them
with the Android share sheet. When the bridge is reachable, **Send to PC** stores the note in
`synced_chats/notes/` on the computer; if the PC is off, the note stays on the phone and can be sent
later.

### Area profiles

Each note picks a profile: the profile defines its types and statuses and the label of the two
specific fields (project and character/module).

| Profile | Its fields | Types | Statuses |
| --- | --- | --- | --- |
| **General** | Project · Detail | Note | — |
| **Writer** | Work · Character | Character, Scene, Plot, Dialogue, Correction, Research, Idea | Idea, Draft, Review, Closed |
| **Programmer** | Project · Module or file | Bug, Improvement, Refactor, Task, Decision, Idea | Open, Fixed, Verified |
| **Teacher** | Subject · Group or student | Lesson, Activity, Exam, Rubric, Observation, Material | Draft, Ready, Applied, Graded, Archived |
| **Journalist** | Case or topic · Source | Tip, Interview, Article, Research, Correction, Idea | Open, In progress, Review, Published, Archived |
| **Legal** | Case file · Client | Brief, Evidence, Deadline, Hearing, Contract, Research, Note | Open, In progress, Review, Filed, Closed |
| **Design** | Client · Project | Brief, Concept, Wireframe, Mockup, Asset, Feedback, Note | Idea, Draft, Review, Approved, Delivered |

Besides type and status, every note carries **tags**, **priority** (low, medium or high) and an
optional **due date** chosen from a date picker. The list can be **sorted by due date** (notes with
a date first, nearest to farthest) and the **"With date"** and **"Priority"** filters narrow the
view. Search ignores **accents and letter case**: `garcia` finds `García`.

### Privacy

- `notes.json` is stored **encrypted at rest** with **AES-256-GCM** and an **AndroidKeyStore** key;
  a plaintext file from a previous version is migrated to encrypted form the first time it is read.
- The Notes screen uses **FLAG_SECURE**: screenshots are blocked and no note thumbnails appear in
  the recent-apps switcher.
- A note can be marked **"Solo en el teléfono"** (phone only): it is never sent, it is excluded from
  "Send all", and sharing it asks for confirmation.
- Notes never talk to the Internet: no accounts, no API keys and no requests to external services.
  They only leave the phone when you tap "Send to PC", over the private network.

### Sending to the PC and the inbox

**Send to PC** writes the note into `synced_chats/notes/` with front matter that includes `id`,
`dueDate` and `updatedAt`, plus profile, type, project, character/module, tags, status and
priority. Sending is **idempotent by `id`**: resending the same note updates the same file on the PC
instead of duplicating it. A **title-only note** is allowed (the body may be empty) and sending never
deletes anything on the phone. Notes are not tied to any conversation: sending only leaves the file
on the computer.

The PC panel has a **"Notes received"** inbox with the **last 10 notes**, **read-only** (title,
type, project and date). The full metadata list, without bodies, is available at
`GET /dsh-companion/notes`.

### Accessibility

- The editor is **scrollable with the keyboard open**, so the body field is never covered.
- Touch targets are **≥48 dp** and the badges keep **AA** contrast.
- The chips announce the selected option to **TalkBack** and **autosave** uses a live region.
- Every card has an **accessible description** and the title shows **2 lines** before it is
  truncated.

The **offline chat reader** still needs the PC: synchronized chats are served by the bridge. The old
cloud chat mode was retired in 5.2.8 because it only worked with the PC on; local notes replace it
without depending on the computer.

## Honest limitations

This design is intended for **personal use**: one operator, their trusted devices and their private network. It is not a multi-tenant service.

- The bridge grants full access to the DeepSeek Harness session of the underlying Windows user account. There is no per-device privilege separation.
- There are no user accounts or RBAC: anyone holding an authorized device controls the session.
- The pairing panel logs recent activity for operational visibility, but it is not an immutable audit ledger and can be cleared with one button.
- A public or shared ZeroTier network voids the private perimeter. Keep networks private with manual node authorization at my.zerotier.com.
- A local administrator on the host can inspect credentials and conversation logs. That is Windows' security model, not an architectural flaw of the bridge.
- Synchronized chats are stored in plaintext inside `synced_chats/`. On Windows, POSIX `0600` does not translate to strict ACLs: effective protection is the user profile ACL. Use BitLocker on shared hardware.
- The bridge speaks cleartext HTTP inside the VPN tunnel. That is sound while ZeroTier or Tailscale encrypt transit end to end; never expose the bridge port outside the VPN.
- The Android network security config cannot express IP ranges, so the "private only" cleartext rule is enforced in app code (see `CleartextPolicy`). An attacker who already sits inside your VPN can still read that traffic: the encryption is the tunnel.
- The completion notification depends on DeepSeek Harness writing the `turn/end` record to the session log. If a future Harness version changes that format, the notice stops arriving (the in-app test button tells you which half failed).

---

## Stability

**5.4.0 is the current stable release of the 5 series.** The `stable/5` branch keeps this tree and receives only security and maintenance fixes; the 5.3.x line is the previous line.


## Screenshots

| App | Panel | Offline reader |
| --- | --- | --- |
| ![App](docs/images/app.png) | ![Panel](docs/images/panel.png) | ![Offline reader](docs/images/offline.png) |

## Community project notice

> **Notice:** DSH Mobile Companion is a companion mobile client developed by the community to facilitate secure remote access to DeepSeek Harness over private networks (ZeroTier / Tailscale). It is not an official DeepSeek product, nor is it affiliated with, sponsored by, or endorsed by DeepSeek. All referenced trademarks and logos belong to their respective owners.

## Project documents

[SECURITY.md](SECURITY.md) · [AUDIT_CLOSURE.md](AUDIT_CLOSURE.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [CHANGELOG.md](CHANGELOG.md) · [DISPOSITIVOS.md](DISPOSITIVOS.md) · [RELEASING.md](RELEASING.md) · [OPERACION.md](OPERACION.md) · [SUPPORT.md](SUPPORT.md) · [CHECKLIST-ESTABLE.md](CHECKLIST-ESTABLE.md) · [AUDITORIA-EXTERNA.md](AUDITORIA-EXTERNA.md) · [AI_SETUP_PROMPT.md](AI_SETUP_PROMPT.md) · [AGENT_COMPAT.md](AGENT_COMPAT.md) · [LICENSE](LICENSE)

## iPhone / iPad

There is no iOS app. Safari → *Add to Home Screen* runs the full interface while the PC is on (no background notifications on iOS). The offline reader still needs the computer: the synchronized chats it shows are served by the bridge, so it is not a standalone app.

## Business use

Enterprise use in production, integration into a product or service, and redistribution require a separate license (Business Source License 1.1). Companies can open a request with the **Commercial license** form: [github.com/TintaYNodos/dsh-mobile-companion/issues/new/choose](https://github.com/TintaYNodos/dsh-mobile-companion/issues/new/choose). Details in [LICENSING.md](LICENSING.md).

## License

Business Source License 1.1 (BUSL-1.1). Free for individual, educational and non-commercial use. Commercial redistribution and commercial exploitation are prohibited without express authorization.

Authorship and copyright ownership: Ismael Muñoz Reyes · Tinta y Nodos. See [LICENSE](LICENSE). Details in [LICENSING.md](LICENSING.md).
