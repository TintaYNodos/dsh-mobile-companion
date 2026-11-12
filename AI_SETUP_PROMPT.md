# AUTOMATED SETUP GUIDE USING AN AI AGENT

> **For the user:** If you use an AI coding assistant or agent with terminal access (such as DeepSeek Harness, Cursor, Claude Code, GitHub Copilot, Windsurf, or similar), simply copy and paste the prompt below into your conversation. The AI will autonomously install, start, verify, and configure the entire companion system, providing you with simple instructions to connect your mobile device.

---

## 📋 PROMPT FOR YOUR AI ASSISTANT

*Copy the entire block below and paste it directly into your AI chat:*

```text
Act as a technical setup assistant on this machine.
Your objective is to install, activate, verify, and completely configure "DSH Mobile Companion" (a secure companion bridge providing mobile access to DeepSeek Harness over a private ZeroTier or Tailscale network), and provide me with clear, jargon-free instructions to connect my phone.

Follow these steps autonomously and in order:

1. ENVIRONMENT & TOOL DISCOVERY:
   - Verify that DeepSeek Harness is installed by checking "%USERPROFILE%\.dsh".
   - Locate Node.js. If not in the global system PATH, use the runtime bundled with DeepSeek Harness at:
     "%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
   - Identify the private network IP address (ZeroTier in 10.x.x.x range or Tailscale in 100.x.x.x range). If not yet active, note that it should be connected, but proceed with local setup.

2. CLONE OR PREPARE REPOSITORY:
   - If not already inside the repository or if the directory does not exist, clone it:
     git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
   - Set the repository root as your working directory.

3. CONFIGURE SILENT BACKGROUND AUTOSTART:
   - Set up silent startup with Windows by running "install-autostart.bat" or creating the shortcut to "run-hidden.vbs" in:
     "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DSH-Mobile-Companion.lnk"
   - Launch the background service immediately using "run-hidden.vbs". It must run silently in the background with no lingering terminal windows.

4. HEALTH & CONNECTIVITY VERIFICATION:
   - Make an HTTP GET request to:
     http://127.0.0.1:57420/dsh-companion/status
   - Confirm it responds with HTTP 200 and valid JSON.
   - Inspect "service", "version", and "dshOnline" to check whether DeepSeek Harness is actively running on this computer.

5. FINAL REPORT & USER RECOMMENDATIONS (PLAIN, SIMPLE LANGUAGE):
   Provide me with a clear, straightforward summary with zero unnecessary technical jargon:
   a) The exact URL to open in my mobile browser (e.g. http://<VPN_IP>:57420).
   b) The link to download the native Android app (DSH-Companion.apk) from official GitHub Releases:
      https://github.com/TintaYNodos/dsh-mobile-companion/releases
   c) The one-click pairing step: explain that I should open "http://127.0.0.1:57420/pair" on my PC and click "Authorize" when my phone attempts to connect for the first time (a 30-day credential that auto-renews with use).
   d) A friendly reminder to keep the private VPN (ZeroTier or Tailscale) connected on both PC and phone when in use.
```
