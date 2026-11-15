# Changelog

All notable changes to DSH Mobile Companion. The project follows `MAJOR.MINOR.PATCH` and the
Android `versionCode` increments once per published build.

## 4.5.10 — `versionCode` 37

Security hardening, mobile client refactor and documentation.

### Security

- The remote terminal is **disabled by default** (`DSH_ENABLE_TERMINAL=1` to enable it) and, when
  enabled, only accepts loopback requests.
- Device approval endpoints (`/dsh-companion/action`, `notification-action`) are loopback-only: a
  paired phone can no longer approve other devices.
- `isCompanionRequestTrusted` is now **fail-closed**: without `DSH_COMPANION_TOKEN` it returns
  `false` and the sync route demands a verifiable credential.
- The panel no longer has a permanent token: entry is a **single-use ticket** (2 minutes) exchanged
  for an `HttpOnly`, `SameSite=Strict` session cookie held in memory. Nothing is written to
  `companion-panel-url.txt` any more.
- The Android client stores the access keys **encrypted with AES-256-GCM in the Android Keystore**,
  with automatic migration of plaintext values.
- `CleartextPolicy` blocks every non-HTTPS request that is not aimed at the configured bunker or a
  private/loopback address, and the network security config forbids cleartext to the public services
  the app talks to. `usesCleartextTraffic` is gone.
- Anonymous `/dsh-companion/status` returns a minimal payload and no longer computes telemetry, which
  removed an unauthenticated CPU/DoS vector.
- `DSH_ACCESS_DISABLE=1` refuses to start unless the bridge is bound to loopback.
- Device lifetime (`DSH_DEVICE_TTL_DAYS`) is now **enforced server-side**: expired devices are
  rejected and purged instead of being authorised forever.
- The access key is no longer written in full to `bridge.log` (last four characters only).
- Kill switch now also **rotates the access key**.

### Fixed

- **Duplicate "response finished" notifications.** The watcher fired on "the session file stopped
  growing", which counted every pause of the model or a tool. It now fires on the `turn/end` record
  of the session log: exactly one notification per turn, with long pauses ignored.
- **PC notifications never arrived.** The foreground service asked for the access key from a
  preference that nobody wrote and never sent the device cookie, so the bridge answered 403 in a
  silent retry loop. It now resolves the active PC key and sends the cookie.
- Notification channels are created when the service starts, not only when the app opens.
- Approving from a notification is refused while the device is locked, and approval notifications are
  hidden from the lock screen.
- `onRenderProcessGone` rebuilds the WebView instead of letting Android kill the app.
- Registry writes no longer fail with `EBUSY` when several clients refresh their device stamp.
- The injected client script had a syntax error that made the whole touch layer dead; the escaping is
  fixed and the embedded script is validated by the tests.

### Changed

- **Every source file is now under 400 lines** (was: `MainActivity.java` 4 472,
  `offline.html` 1 466, `mobile-client.mjs` 1 063, `routes.mjs` 620, `NotificationHelper.java` 601).
  The Android client is split into focused classes, the injected client into modules, and the offline
  page into HTML + three stylesheets + three scripts.
- Duplicated helpers unified: approval card lookup, document title cleanup, haptics, focus loss
  prevention (which was registered twice), and the detail element lookups in the offline reader.
- `npm test` runs the ten verification suites (136 checks) against a live bridge. The destructive
  kill-switch check is opt-in with `DSH_TEST_DESTRUCTIVE=1`.
- `package.json` added as the single source of the project version, and a `Dockerfile` that copies the
  new offline assets.

## 4.5.4 — `versionCode` 31

- Kill switch reports the real result of the revoke request instead of claiming success.
- Notification channels split by purpose (approvals, tasks, connection, PC responses, service,
  critical).
- QR pairing fallback rewritten: offers the last known address, "use this address" and network scan.

## 4.4.1 — `versionCode` 22

- First public release: bridge, touch layer, APK, seven READMEs, installers for Windows, macOS and
  Linux, Docker files.
