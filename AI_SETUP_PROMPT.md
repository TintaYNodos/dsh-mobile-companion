# AI Setup Prompt

A self-contained prompt for an AI coding assistant (DeepSeek Harness, Cursor, Claude Code, Copilot,
…) that installs, starts and verifies DSH Mobile Companion on the user's computer.

Copy everything inside the block into the assistant's chat.

```text
Act as a technical setup assistant on this machine.

Your objective: install, start, verify and configure "DSH Mobile Companion", a local bridge that
gives the user's phone access to DeepSeek Harness over a ZeroTier or Tailscale private network.
Then explain, without jargon, how to connect the phone.

Follow these steps in order and report what you did at each one:

1. Check the environment.
   - The DSH home is "%USERPROFILE%\.dsh" on Windows, "~/.dsh" on macOS and Linux.
   - Locate Node.js: "node -v" must be 22.15 or newer. If it is not in PATH, use the runtime that ships
     with DSH: "%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe".
   - Confirm DeepSeek Harness is running locally (it listens on a loopback port and writes
     ".credentials.yaml" inside the DSH home).

2. Get the project.
   - If the current directory already contains "bridge.mjs" and "src/", use it.
   - Otherwise clone: git clone https://github.com/TintaYNodos/dsh-mobile-companion.git

3. Configure.
   - Do not hardcode any IP address in the sources.
   - Leave the access key at its default (generated on first start) unless the user asks otherwise.
   - 
4. Start it in the background.
   - Windows: run "install-autostart.bat" once. It registers the silent startup **and starts the bridge**, so do not launch "run-hidden.vbs" again (the second instance would only fail with EADDRINUSE).
   - macOS: "install-launchd.sh". Linux: "install-systemd.sh".
   - Do not run the bridge in a visible console window as the final state.

5. Verify, and paste the evidence.
   - GET http://127.0.0.1:57420/dsh-companion/status must answer 200.
   - The response must show "status": "online" and a "version".
   - The log file must contain the bind interface line with the private VPN address.
   - If ZeroTier or Tailscale is not detected, ask the user for their private IP and start the
     bridge with DSH_BIND_HOST set to it.

6. Explain the phone connection in plain language:
   - Open http://<VPN_IP>:57420 on the phone, or install DSH-Companion.apk from the Releases page.
   - The first time, the phone shows "Confirm on your computer".
   - On the computer, run "panel.bat". A local panel opens on 127.0.0.1 only. Press Authorize on the
     device that appears.
   - The phone connects and will not ask again for 30 days of continued use.

Rules:
- Never expose the bridge port outside the private network and never forward it on the router.
- Never print the full access key; it lives in "%USERPROFILE%\.dsh\companion-access-key".
- Do not modify the project sources to "make it work": if something fails, report the exact error.
- If a step fails, stop and show the command, the output and the log lines that explain it.
```

## After the setup

- `npm test` runs the verification suites (needs the bridge running).
- `SECURITY.md` explains how to report a vulnerability.
- `DISPOSITIVOS.md` documents the device registry, the panel and the kill switch.
