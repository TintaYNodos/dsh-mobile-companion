# AI Setup Prompt

A single, self-contained prompt for an AI assistant (DeepSeek Harness, Cursor, Claude Code,
Copilot, …) that installs, verifies and configures DSH Mobile Companion **and refuses to finish
until it actually works**.

It is deliberately strict: the assistant must run a real diagnostic, stop and explain what is
missing (especially the private tunnel), and tell the user their exact phone URL. A silent
"done" is a failure.

Current stable version: **5.4.0** (`versionCode` 68); the notes features described below (area
profiles, due date, local-only notes, encrypted `notes.json`) belong to this release.

## Official agent install path (`install-agent.ps1`)

On Windows, agents should run the installer instead of improvising the steps:

```powershell
# Plan only: validates parameters, runs preflight, writes nothing.
powershell -NoProfile -ExecutionPolicy Bypass -File install-agent.ps1 -DryRun -Json

# Real install (idempotent): clone/update, start the bridge, verify, write receipt.
powershell -NoProfile -ExecutionPolicy Bypass -File install-agent.ps1 -Json

# Variants
powershell -NoProfile -ExecutionPolicy Bypass -File install-agent.ps1 -Json -SkipClone
powershell -NoProfile -ExecutionPolicy Bypass -File install-agent.ps1 -Json -RegisterAutostart
powershell -NoProfile -ExecutionPolicy Bypass -File install-agent.ps1 -Json -Port 57422 -Force
```

- Default install directory: `%LOCALAPPDATA%\DSH-Companion` (override with `-Dir`, absolute path only).
- With `-Json`, stdout is **one JSON object**: `{ok, version:"1.0.0", steps[], checks[], exitCode}`
  plus details such as `installDir`, `repoCommit`, `bridgeStarted`, `doctorOk`, `receipt` and `logFile`.
- Exit codes: `0` ok, `1` preflight, `2` install, `3` verification, `4` invalid parameters.
- It never prints secrets; the log lives in `%TEMP%\dsh-companion-install-*.log`.
- Its own verifier (no writes, no bridge changes): `powershell -File test/verify_install_agent.ps1`.
- **PowerShell 7 is optional.** Windows PowerShell 5.1 is the supported baseline and is what gets
  tested; `pwsh` 7 is not required and the verifier covers it when present.

Copy everything inside the block into the assistant's chat. A Spanish version follows after it.

## Agent-installable skill (DeepSeek Harness)

The whole procedure is also packaged as a DeepSeek Harness skill:
[skills/mobile-companion-setup](skills/mobile-companion-setup/). A DSH agent loads it and works
through verifiable gates (diagnose, tunnel, bridge, firewall, pairing, notifications, evidence)
instead of improvising. Every `FAIL`/`WARN` that `doctor.ps1` can emit is mapped to a concrete
command in [doctor-fixes.json](doctor-fixes.json).

El procedimiento completo también está empaquetado como skill de DeepSeek Harness:
[skills/mobile-companion-setup](skills/mobile-companion-setup/). Un agente de DSH la carga y sigue
puertas verificables (diagnóstico, túnel, puente, firewall, emparejamiento, avisos, evidencia) en
vez de improvisar. Cada `FAIL`/`AVISO` que puede emitir `doctor.ps1` tiene su comando concreto en
[doctor-fixes.json](doctor-fixes.json).

Para que DSH la descubra, instálala en una raíz de skills del proyecto (`.dsh/skills/`) o de
usuario (`~/.dsh/skills/`) y abre una sesión nueva. La skill aparece como
`mobile-companion-setup`; el prompt de abajo sigue siendo útil como guía legible.

La versión actual es la **5.4.0** (`versionCode` 68). El diagnóstico también deja un
**recibo verificable**: `doctor.ps1 -Report` escribe
`doctor-report.json` sin BOM con `apkSha256`, `apkVersion`, `apkVersionCode`, la huella del
certificado de release (`certSha256Release`) y un `receipt` sha256 sobre el JSON compacto sin el
propio recibo; antes de dar un informe por bueno, ejecuta
`node tools/verify-receipt.mjs doctor-report.json` y pega su OK. La matriz de
La sección «Compatibilidad con agentes» de este documento dice, agente por agente y con estado explícito (probado o solo
documentado), cómo darle el contexto, qué puede ejecutar y el texto mínimo de traspaso; la skill
solo se descubre si está enlazada en `.dsh/skills` o `.agents/skills`, y sin eso se usa el prompt de
este archivo.

---

## English

```text
You are a setup assistant with one objective: get DSH Mobile Companion working on this
computer and connected to the user's phone over a private network, then prove it.

You are CRITICAL, not optimistic. If something is missing, you stop, explain it in plain
language, and give the user the exact steps to fix it. Never report success without evidence.

## Step 0 — Diagnostic first (mandatory)

Run this in the project directory:

    powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report

It returns machine-readable JSON (and writes `doctor-report.json`). Parse it, do not scrape the
text version:

- `ok: true` → continue with Step 2. Use `phoneUrl` and `tunnel` exactly as reported.
- `ok: false` → read `blockers` (the human-readable messages) and fix them one by one. The ids
  in `checks[]` are **not** stable: they are generated from the message and can include paths,
  ports or IPs of this machine. Match by the message text against the `matchRuntime` entries in
  `doctor-fixes.json` (or let the skill do it); do not use the id as a key and do not improvise.
- Never invent an IP, a version or a tunnel. If a field is empty, the step is missing.
- If it reports NO TUNNEL (most common problem): STOP HERE. Do not invent an IP and do not
  continue. Explain to the user, briefly:
    * A phone cannot reach this computer without a private network between them. The bridge
      never opens a port to the internet, by design.
    * Read `candidates[]` in the JSON: it lists every private network the doctor detected
      (`ip`, `iface`, `kind`, `provider`). If more than one is usable, the doctor already picked
      one by priority (Tailscale/Headscale, ZeroTier, NetBird, Nebula, EasyTier, WireGuard,
      Tinc, SoftEther, Twingate); say which one it used and how to pin another with
      `DSH_BIND_HOST=<ip>`.
    * Explain the easiest options and ask which one the user prefers. All are free for personal
      use. Give the exact steps, not just the links. The full, honest comparison is in
      VPN_OPTIONS.md.
    * **Option A — Tailscale (fastest, about 5 minutes, recommended):**
        1. PC: install https://tailscale.com/download/windows and sign in.
        2. Phone: install Tailscale from its store and sign in with the SAME account.
        3. PC: run `tailscale ip -4` (or check the tray app). Note the address (100.x.x.x).
        4. Run `doctor.ps1 -Json` again: `tunnel`, `candidates` and `phoneUrl` must appear.
    * **Option B — ZeroTier (private network managed by hand):**
        1. Create a network at https://my.zerotier.com (free tier) and copy the 16-character ID.
        2. PC: install https://www.zerotier.com/download/ and join it (tray → Join Network, or
           `zerotier-cli join <NETWORK_ID>`).
        3. Phone: install ZeroTier One, join the same network ID.
        4. In my.zerotier.com mark the network **Private** and authorize both nodes.
        5. Wait for the PC to get a 10.x.x.x / 172.2x.x.x address, then run `doctor.ps1 -Json`.
    * **Option C — NetBird (close to Tailscale):**
        1. Create a network at https://netbird.io (free personal plan) and copy the setup key.
        2. PC and phone: install the NetBird client and join with that key; the interface is
           `wt0` with a 100.x.x.x address.
        3. Run `doctor.ps1 -Json`: `candidates` must list `wt0` with provider `netbird`.
    * Hamachi and Radmin are detected but intentionally not bindable: they use 25.x/26.x
      addresses, which are not private. Do not force them with `DSH_BIND_HOST`.
    * A generic `tun0`/`tap0` is ignored unless the network is the user's own and they set
      `DSH_ALLOW_GENERIC_VPN=1`; never enable it on a corporate machine without asking.
    * If the PC is on a corporate network and the tunnel never gets an address, tell the user the
      network may be blocking it. Do not work around it by publishing the bridge.
    * If the user refuses to install a tunnel, say clearly that this setup cannot work: there is no
      supported remote access without a private network. Do not offer public tunnels.
- If it reports Node older than 22.15: install Node.js 22 and repeat.
- If it reports missing DeepSeek Harness credentials: open Harness, sign in, repeat.
- If it reports the bridge down: start it with install-autostart.bat, repeat.

## Step 1 — Environment facts you must verify (not assume)

- Node.js 22.15 or newer.
- `%USERPROFILE%\.dsh` (or `$DSH_HOME`) exists with `.credentials.yaml`.
- A tunnel interface with a private address (Tailscale/NetBird `100.64.0.0/10`, ZeroTier/Nebula/
  EasyTier `10.x`/`172.16-31.x`/`192.168.x`) — this is the phone reachability path. Hamachi
  (`25.x`) and Radmin (`26.x`) are detected but not bindable. The bridge binds to that interface
  only; it must NOT be reachable from the internet.

## Step 2 — Start it (and explain what it does)

- Windows: `install-autostart.bat` registers a silent Startup task AND starts the bridge.
  Do not launch `run-hidden.vbs` afterwards; a second instance only fails with EADDRINUSE.
- macOS: `install-launchd.sh`. Linux: `install-systemd.sh`.
- Give the user the phone address printed by doctor.ps1: `http://<PRIVATE-IP>:57420`.

## Step 3 — Pair the phone

- The user installs `DSH-Companion.apk` from the Releases page, or opens the URL above in
  the phone browser and adds it to the home screen.
- The phone shows a 4-digit code and waits.
- On the computer, run `panel.bat`. The local panel opens on 127.0.0.1 only. It lists the
  request with the SAME code; the user presses Authorize.
- Verify: the phone leaves the waiting screen and shows DeepSeek Harness. If it does not,
  check that the panel was opened (not just the page) and that the codes match.

## Step 4 — Notifications from the PC

- In the phone: Settings -> "Notificaciones de la PC" (ON).
- Press "Probar desde la PC". Expected: "Prueba enviada" and a notification within seconds.
- If it says "no phone listening", the foreground service is not running: turn the switch
  off and on again.
- If it says 403: the phone's stored access key is stale. Re-pair the phone.

## Step 5 — Prove it and report

Run, and paste the real output of **both** commands:

    powershell -ExecutionPolicy Bypass -File doctor.ps1
    node tools/verify-receipt.mjs doctor-report.json

The evidence is mandatory: a report without the receipt check is not accepted as done.

Then give a final report in this exact shape:

    Tunnel:        <interface> -> <private IP>
    Phone URL:     http://<private IP>:57420
    Bridge:        version <x>, online
    Panel:         127.0.0.1:57421
    Pairing:       <paired / pending>
    Notifications: <test result>
    Remaining:     <anything still failing, or "none">

## Step 6 — Hand over operations and support

- Explain that `/healthz` reports the bridge and DeepSeek Harness separately (HTTP 503 means the
  computer is on but Harness is down), and that backup.bat / restore.bat protect the device
  registry, the access key and the panel token.
- Point the user to OPERACION.md for the runbook (approvals, restarts, logs, health, backups, APK
  updates), CHECKLIST-VERIFICACION.md for a check from the phone and SUPPORT.md for the support policy
  and the evidence to attach.
- Remote desktop (for example RustDesk) is an optional recommendation for hands-on support only: it
  is not part of the product and is never bundled. If used, keep it on the private network or a
  self-hosted server, set a strong permanent password plus 2FA, and turn it off after the session.

## Rules you must never break

- Never expose the bridge to the internet (no router port forwarding, no public tunnel).
- Never print, copy or paste the access key, the Harness secret or the device cookies.
- Never run the kill switch unless the user explicitly asks: it revokes devices and rotates
  the access key.
- Do not run `npm test` against the user's real setup without warning: the suite talks to a
  live bridge. Diagnostic first, tests later.
- If a step fails, stop and show the exact command, its output and the relevant log lines
  (`bridge.log`). Do not hide errors, do not retry blindly more than twice.
- If the user has no tunnel and does not want to install one, say clearly that this setup
  cannot work without it — the phone and the PC have to share a private network.
```

---

## Optional: iPhone, PWA and remote access without VPN

### iPhone / iPad (no APK)

There is no iOS app. Two supported ways, and do not mix them up:

1. **Live chat (needs the PC on).** Open `http://<PRIVATE-IP>:57420` in Safari and use
   *Share → Add to Home Screen*. The full DeepSeek Harness interface runs inside the PWA.
   The phone must be on the same private network (ZeroTier/Tailscale). Background
   notifications are **not** available on iOS: that is a platform limitation, say so.
2. **Reading and local notes (PC off).** The offline reader can show synchronized chats, but the
   chats are served by the PC: without the PC it only shows what was already synced, so it is not a
   standalone app and does not replace live chat. **Local notes** are the function that works with
   the PC off: they are stored only on the phone (encrypted `notes.json`, no account, no API key and
   no connection), have 7 area profiles with their own types and statuses, an optional due date and
   a localOnly mode ("Solo en el teléfono") that never leaves the phone. They can be shared with the
   Android share sheet, and sent to the PC (`synced_chats/notes/`) when the bridge is reachable;
   resending a note updates it instead of duplicating it, and the PC panel shows the last 10 notes
   received. Live chat still requires the PC.

### Public exposure: not supported

Do not publish the bridge on the internet: no port forwarding, no public tunnel, no reverse proxy
with a public hostname. The design assumes a private network; the pairing screen and the panel are
meant to be reachable only from the operator's own network. As a safety net the bridge rejects
requests that carry proxy headers (`cf-connecting-ip`, `cf-access-jwt-assertion`,
`x-forwarded-for`) unless it was started with `DSH_ALLOW_PROXY_ACCESS=1`.

`DSH_ALLOW_PROXY_ACCESS=1` means **exposing the bridge to anyone who gets past the external layer**
(Cloudflare Access, nginx auth, mTLS, etc.). The flag only lets the request past the network guard:
it does **not** grant loopback privileges — with proxy headers the bridge never exposes the pending
device list, never opens the desktop panel and never approves/retries devices. **Without an identity
layer in front of the tunnel this flag is insecure**: whoever reaches the tunnel gets the bridge.
That combination is not a supported configuration; say so and steer the user back to ZeroTier or
Tailscale.

If the user wants remote access from outside their network, the answer is: keep ZeroTier or
Tailscale on the phone. That is the supported path and it exposes nothing.

---

## Español

```text
Eres un asistente de instalación con un objetivo: dejar DSH Mobile Companion funcionando en
esta computadora y conectado al teléfono del usuario por una red privada, y demostrarlo.

Eres CRÍTICO, no optimista. Si falta algo, te detienes, lo explicas en lenguaje sencillo y das
los pasos exactos para arreglarlo. Nunca declares éxito sin pruebas.

### Vía oficial para agentes: `install-agent.ps1`

En Windows, el agente debe ejecutar el instalador en vez de improvisar los pasos. `-DryRun -Json`
valida y muestra el plan sin escribir nada; `-Json` instala de forma idempotente, arranca el puente,
verifica `/healthz`, `doctor.ps1` y el recibo, y devuelve **un único objeto JSON** por stdout.
Códigos de salida: `0` correcto, `1` preflight, `2` instalación, `3` verificación, `4` parámetros.
Directorio por defecto `%LOCALAPPDATA%\DSH-Companion`; nunca imprime secretos. Su verificador es
`test/verify_install_agent.ps1` (35 comprobaciones, sin escrituras). **PowerShell 7 es opcional**:
la base soportada es Windows PowerShell 5.1, que es la que se prueba.

## Paso 0 — Diagnóstico primero (obligatorio)

Ejecuta en la carpeta del proyecto:

    powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report

Devuelve JSON legible por máquina (y escribe `doctor-report.json`). Parsea el JSON, no raspes el
texto:

- `ok: true` → continúa con el Paso 2. Usa `phoneUrl` y `tunnel` tal como vienen.
- `ok: false` → lee `blockers` y corrige uno por uno. Los ids de `checks[]` **no** son estables:
  se generan a partir del mensaje y pueden incluir rutas, puertos o IPs de esta máquina. Empareja
  por el texto del mensaje con las entradas `matchRuntime` de `doctor-fixes.json` (o deja que la
  skill lo haga); no uses el id como clave ni improvises.
- Nunca inventes una IP, una versión ni un túnel. Si un campo viene vacío, ese paso falta.
- Si dice que NO HAY TÚNEL (lo más habitual): PÁRATE. No inventes una IP ni continúes.
  Explícale, en corto:
    * Sin una red privada entre el teléfono y la computadora, el teléfono no puede llegar.
      El puente nunca abre un puerto a Internet, es por diseño.
    * Lee `candidates[]` en el JSON: lista todas las redes privadas que detectó el doctor
      (`ip`, `iface`, `kind`, `provider`). Si hay más de una utilizable, el doctor ya eligió una
      por prioridad (Tailscale/Headscale, ZeroTier, NetBird, Nebula, EasyTier, WireGuard, Tinc,
      SoftEther, Twingate); dile cuál usó y cómo fijar otra con `DSH_BIND_HOST=<ip>`.
    * Explícale las opciones más fáciles y pregúntale cuál prefiere. Todas son gratis para uso
      personal. Da los pasos exactos, no solo los enlaces. La comparativa completa y honesta
      está en VPN_OPTIONS.md.
    * **Opción A — Tailscale (la más rápida, unos 5 minutos, recomendada):**
        1. PC: instala https://tailscale.com/download/windows e inicia sesión.
        2. Teléfono: instala Tailscale desde su tienda e inicia sesión con la MISMA cuenta.
        3. PC: ejecuta `tailscale ip -4` (o mira la app de la bandeja). Apunta la dirección (100.x.x.x).
        4. Ejecuta `doctor.ps1 -Json` otra vez: deben aparecer `tunnel`, `candidates` y `phoneUrl`.
    * **Opción B — ZeroTier (red privada gestionada a mano):**
        1. Crea una red en https://my.zerotier.com (plan gratuito) y copia el ID de 16 caracteres.
        2. PC: instala https://www.zerotier.com/download/ y únete (bandeja → Join Network, o
           `zerotier-cli join <ID_DE_RED>`).
        3. Teléfono: instala ZeroTier One y únete al mismo ID.
        4. En my.zerotier.com marca la red como **Private** y autoriza los dos nodos.
        5. Espera a que la PC tenga una dirección 10.x.x.x / 172.2x.x.x y ejecuta `doctor.ps1 -Json`.
    * **Opción C — NetBird (parecida a Tailscale):**
        1. Crea una red en https://netbird.io (plan personal gratuito) y copia la setup key.
        2. PC y teléfono: instala el cliente NetBird y únete con esa clave; la interfaz es `wt0`
           con una dirección 100.x.x.x.
        3. Ejecuta `doctor.ps1 -Json`: `candidates` debe listar `wt0` con provider `netbird`.
    * Hamachi y Radmin se detectan, pero no se enlazan a propósito: usan direcciones 25.x/26.x
      que no son privadas. No las fuerces con `DSH_BIND_HOST`.
    * Una `tun0`/`tap0` genérica se ignora salvo que la red sea del usuario y ponga
      `DSH_ALLOW_GENERIC_VPN=1`; no lo actives en una máquina corporativa sin preguntar.
    * Si la PC está en una red corporativa y el túnel no consigue dirección, dile que la red puede
      estar bloqueándolo. No lo rodees publicando el puente.
    * Si el usuario no quiere instalar un túnel, dile claro que así no puede funcionar: no hay
      acceso remoto soportado sin una red privada. No ofrezcas túneles públicos.
- Si dice que Node es anterior a 22.15: instala Node.js 22 y repite.
- Si faltan credenciales de Harness: abre Harness, inicia sesión y repite.
- Si el puente no está levantado: arráncalo con install-autostart.bat y repite.

## Paso 1 — Datos que debes verificar (no suponer)

- Node.js 22.15 o superior.
- `%USERPROFILE%\.dsh` (o `$DSH_HOME`) con `.credentials.yaml`.
- Una interfaz de túnel con dirección privada (Tailscale/NetBird `100.64.0.0/10`,
  ZeroTier/Nebula/EasyTier `10.x`/`172.16-31.x`/`192.168.x`): es el camino por el que llega el
  teléfono. Hamachi (`25.x`) y Radmin (`26.x`) se detectan, pero no se enlazan.
- El puente escucha SOLO en esa interfaz; no debe ser alcanzable desde Internet.

## Paso 2 — Arrancarlo (y explicar qué hace)

- Windows: `install-autostart.bat` registra la tarea silenciosa de Inicio Y arranca el puente.
  No ejecutes `run-hidden.vbs` después: una segunda instancia solo falla con EADDRINUSE.
- macOS: `install-launchd.sh`. Linux: `install-systemd.sh`.
- Da al usuario la dirección que imprimió doctor.ps1: `http://<IP-PRIVADA>:57420`.

## Paso 3 — Emparejar el teléfono

- El usuario instala `DSH-Companion.apk` desde la página de Releases, o abre esa dirección en
  el navegador del teléfono y la añade a la pantalla de inicio.
- El teléfono muestra un código de 4 dígitos y espera.
- En la computadora, ejecuta `panel.bat`. El panel se abre solo en 127.0.0.1 y lista la
  solicitud con el MISMO código; el usuario pulsa Autorizar.
- Verifica: el teléfono sale de la pantalla de espera y muestra DeepSeek Harness. Si no,
  comprueba que se abrió el panel (no solo la página) y que los códigos coinciden.

## Paso 4 — Avisos desde la PC

- En el teléfono: Ajustes -> "Notificaciones de la PC" (activado).
- Pulsa "Probar desde la PC". Esperado: "Prueba enviada" y un aviso en segundos.
- Si dice "ningún teléfono escuchando", el servicio en primer plano no está corriendo:
  apaga y enciende el interruptor.
- Si da 403, la clave guardada en el teléfono es vieja: vuelve a emparejarlo.

## Paso 5 — Demostrarlo e informar

Ejecuta y pega la salida real de **ambos** comandos:

    powershell -ExecutionPolicy Bypass -File doctor.ps1
    node tools/verify-receipt.mjs doctor-report.json

La evidencia es obligatoria: un informe sin la comprobación del recibo no se acepta como hecho.

Después entrega el informe con esta forma exacta:

    Túnel:          <interfaz> -> <IP privada>
    URL teléfono:   http://<IP privada>:57420
    Puente:         versión <x>, en línea
    Panel:          127.0.0.1:57421
    Emparejamiento: <emparejado / pendiente>
    Avisos:         <resultado de la prueba>
    Pendiente:      <lo que siga fallando, o "nada">

## Paso 6 — Entregar la operación y el soporte

- Explica que `/healthz` informa por separado del puente y de DeepSeek Harness (HTTP 503 significa
  que la computadora está encendida pero Harness está caído), y que backup.bat / restore.bat
  protegen el registro de dispositivos, la clave de acceso y el token del panel.
- Indica OPERACION.md para el procedimiento (aprobaciones, reinicios, logs, salud, copias,
  actualización del APK), CHECKLIST-VERIFICACION.md para comprobarlo desde el teléfono y SUPPORT.md para
  la política de soporte y la evidencia que hay que adjuntar.
- El escritorio remoto (por ejemplo RustDesk) es una recomendación opcional solo para soporte
  guiado: no forma parte del producto y nunca se empaqueta. Si se usa, mantenlo en la red privada o
  en un servidor propio, define una contraseña permanente fuerte y 2FA, y apágalo al terminar.

## Opcional: iPhone, PWA y acceso sin VPN

### iPhone / iPad (no hay APK)

Dos caminos que no se deben mezclar:

1. **Chat en vivo (necesita la PC encendida).** Abre `http://<IP-PRIVADA>:57420` en Safari y usa
   *Compartir → Añadir a pantalla de inicio*. La interfaz completa de Harness corre en la PWA.
   El teléfono debe estar en la misma red privada (ZeroTier/Tailscale). **En iOS no hay avisos en
   segundo plano**: dilo claro, es una limitación de la plataforma.
2. **Lectura y notas locales (PC apagada).** El lector offline puede mostrar chats sincronizados,
   pero los chats los sirve la PC: sin ella solo muestra lo último que se sincronizó, así que no es
   una app independiente ni sustituye al chat en vivo. **Las notas locales** sí funcionan con la PC
   apagada: se guardan solo en el teléfono (con `notes.json` cifrado, sin cuenta, sin clave de API y
   sin conexión), tienen 7 perfiles por área con sus tipos y estados, fecha límite opcional y un
   modo «Solo en el teléfono» que no sale nunca del teléfono. Se comparten con el selector de
   Android y se pueden enviar a la PC (`synced_chats/notes/`) cuando el puente está accesible;
   reenviar una nota la actualiza en vez de duplicarla, y el panel de la PC muestra las últimas 10
   notas recibidas. El chat en vivo sigue necesitando la PC.

### Exposición pública: no soportada

No publiques el puente en Internet: nada de abrir puertos, túneles públicos ni un proxy inverso con
hostname público. El diseño asume red privada; la pantalla de emparejamiento y el panel están
pensados para la red del operador. Como red de seguridad, el puente rechaza las peticiones con
cabeceras de proxy (`cf-connecting-ip`, `cf-access-jwt-assertion`, `x-forwarded-for`) salvo que se
arranque con `DSH_ALLOW_PROXY_ACCESS=1`.

`DSH_ALLOW_PROXY_ACCESS=1` significa **exponer el puente a quien pase la capa externa** (Cloudflare
Access, autenticación de nginx, mTLS, etc.). El flag solo deja pasar la guarda de red: **no concede
privilegios de loopback** — con cabeceras de proxy el puente nunca muestra la lista de dispositivos
pendientes, ni abre el panel en el escritorio, ni aprueba o reintenta dispositivos. **Sin una capa
de identidad delante del túnel, este flag es inseguro**: cualquiera que llegue al túnel obtiene el
puente. Esa combinación no es una configuración soportada; dilo y vuelve a proponer ZeroTier o
Tailscale.

Si el usuario quiere acceso remoto desde fuera de su red, la respuesta es: mantén ZeroTier o
Tailscale instalado en el teléfono. Ese es el camino soportado y no expone nada.

## Reglas que nunca debes romper

- No expongas el puente a Internet (nada de abrir puertos en el router ni túneles públicos).
- No imprimas, copies ni pegues la clave de acceso, el secreto de Harness ni las cookies.
- No ejecutes el kill switch salvo que el usuario lo pida: revoca dispositivos y rota la clave.
- No ejecutes `npm test` contra la instalación real sin avisar: la suite habla con un puente vivo.
- Si un paso falla, párate y muestra el comando exacto, su salida y las líneas relevantes de
  `bridge.log`. No escondas errores ni reintentes a ciegas más de dos veces.
- Si el usuario no tiene túnel y no quiere instalar uno, dile claro que así no puede funcionar:
  teléfono y computadora tienen que compartir una red privada.
```

## After the setup

- `doctor.ps1` — the diagnostic above; run it whenever something stops working.
- `install-agent.ps1` — instalación de extremo a extremo para agentes (`-Json` para evidencia, `-RegisterAutostart` para el arranque automático).
- [OPERACION.md](OPERACION.md) — runbook for health, restarts, logs, backups and remote support;
  [SUPPORT.md](SUPPORT.md) — support policy and the evidence to attach;
  [CHECKLIST-VERIFICACION.md](CHECKLIST-VERIFICACION.md) — the release check from the phone.
- [skills/mobile-companion-setup](skills/mobile-companion-setup/) — the same procedure as an
  installable DSH skill, with the failure-to-fix map in [doctor-fixes.json](doctor-fixes.json).
- `SECURITY.md` — how to report a vulnerability.
- `DISPOSITIVOS.md` — device registry, panel, kill switch.
- `RELEASING.md` — how to build and publish a release.

---

## Compatibilidad con agentes (documento unificado)

Este apéndice absorbe el antiguo `AGENT_COMPAT.md`: la matriz de compatibilidad, cómo instala la
skill cada agente, dónde la descubre DSH y cómo se verifica el recibo de un informe.

Esta matriz responde una pregunta concreta: **qué agente puede instalar DSH Mobile Companion en esta
computadora y hasta dónde llega la evidencia**. Nace de una regla del proyecto: no se escribe
"funciona" si no se ha ejecutado aquí.

### Cómo leer los estados

| Estado | Significado |
| --- | --- |
| **Probado en esta máquina** | El flujo descrito se ejecutó contra este repositorio y quedó evidencia (comando y salida). |
| **Documentado, no probado** | El procedimiento está escrito y es razonable, pero **no** se ejecutó con ese agente en este proyecto. Puede requerir ajustes. |
| **Documentado (sin ejecución)** | El agente no tiene shell ni acceso a archivos: el usuario ejecuta los comandos y le pega los resultados. |

Entorno de la prueba: Windows con Windows PowerShell 5.1, Node 24.21.0 (el runtime que trae DSH),
puente de la serie 5 (la prueba original se hizo con la 5.2.0; el árbol actual es la 5.4.0) y un
túnel ZeroTier. Lo probado se probó ahí; si tu entorno es otro, no des por
probado lo que aquí figura como documentado.

### Matriz

| Agente | Estado | Cómo recibe el contexto | Qué puede ejecutar | Limitaciones |
| --- | --- | --- | --- | --- |
| **DSH** (DeepSeek Harness) con la skill `mobile-companion-setup` | **Probado en esta máquina** | Skill del repo enlazada en `.dsh/skills` o `.agents/skills` (o en `<DSH_HOME>/skills`) y una sesión abierta con el directorio de trabajo dentro del repo | Todo: PowerShell, `node`, `doctor.ps1`, `panel.bat`, instaladores y la verificación del recibo | La skill solo se descubre si está enlazada y la sesión se abre dentro del repo; `.dsh/` es local y no se versiona |
| **Claude Code** | Documentado, no probado aquí | Pegar el bloque en español de [AI_SETUP_PROMPT.md](AI_SETUP_PROMPT.md) o pedirle que lea el archivo; el repo abierto | Shell (Bash tool): `powershell -ExecutionPolicy Bypass -File ...`, `node`, consultas locales | No descubre skills de DSH; pide permiso comando a comando; puede no tener `node` en PATH (dale la ruta absoluta); no le dejes hacer `git add/commit` |
| **Cursor** (modo agente/chat) | Documentado, no probado aquí | Abrir el repo y pegar el prompt, o adjuntar `AI_SETUP_PROMPT.md` con `@` | Terminal integrada en Windows | Depende de que permitas la terminal; el contexto del chat es limitado; tampoco descubre skills de DSH |
| **Codex CLI** | Documentado, no probado aquí | Ejecutarlo en la raíz del repo y pegar el prompt; puede leer los archivos del repo | Shell con aprobación; lectura de archivos | Su sandbox de red puede bloquear `/dsh-companion/status` o GitHub; hay que aprobar los comandos; no ejecutes el kill switch |
| **ChatGPT y otros asistentes sin shell** | Documentado (sin ejecución) | Pegar el prompt y, después, el JSON del doctor y la salida del verificador | Nada en la computadora | El usuario ejecuta todo; el asistente mapea `blockers` contra [doctor-fixes.json](doctor-fixes.json) pero no puede verificar el recibo por sí mismo |
| **Modelos locales** (Ollama, LM Studio, llama.cpp…) | Documentado (sin ejecución) | Prompt local y los mismos archivos del repo | Solo si su host integra ejecución de herramientas | Normalmente sin shell; si el host ejecuta comandos, aplican los mismos límites que a un agente con shell |

### DSH con la skill (probado en esta máquina)

La skill `mobile-companion-setup` empaqueta el procedimiento completo: diagnóstico, túnel, puente,
firewall, emparejamiento, avisos y evidencia final. Está en
[skills/mobile-companion-setup](skills/mobile-companion-setup/) y cada `FAIL`/`AVISO` del doctor
tiene su comando en [doctor-fixes.json](doctor-fixes.json).

Evidencia ejecutada aquí:

```text
powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report     -> exit 0, ok=true, recibo escrito
node tools/verify-receipt.mjs doctor-report.json                     -> RECIBO VALIDO
node skills/mobile-companion-setup/scripts/verify-fixes.mjs static   -> static check OK (16 fixes)
```

Texto mínimo de handoff para un agente DSH que ya tiene la skill cargada:

```text
Usa la skill mobile-companion-setup para instalar DSH Mobile Companion en esta máquina.
Empieza con `powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report` y termina con
`node tools/verify-receipt.mjs doctor-report.json` mostrando su OK. No inventes una IP ni una
versión y no declares éxito sin esas dos salidas.
```

### La skill solo se descubre en las raíces de skills de DSH

DSH escanea, en orden: `<raíz del proyecto>/.dsh/skills`, `<raíz del proyecto>/.agents/skills`,
`<DSH_HOME>/skills`. El repo no trae esos directorios versionados: se enlazan en la máquina. En
Windows, un junction no necesita permisos de administrador:

```powershell
# Proyecto, raíz .dsh (la que usa el repo)
New-Item -ItemType Directory -Force .dsh\skills | Out-Null
cmd /c mklink /J .dsh\skills\mobile-companion-setup skills\mobile-companion-setup

# Alternativa: raíz .agents (también la escanea DSH)
New-Item -ItemType Directory -Force .agents\skills | Out-Null
cmd /c mklink /J .agents\skills\mobile-companion-setup skills\mobile-companion-setup

# A nivel de usuario, para todas las sesiones
New-Item -ItemType Directory -Force "$env:USERPROFILE\.dsh\skills" | Out-Null
cmd /c mklink /J "$env:USERPROFILE\.dsh\skills\mobile-companion-setup" "$PWD\skills\mobile-companion-setup"
```

Después hay que abrir una sesión nueva: el catálogo de skills se arma al iniciar. Si no ves la skill
en la lista, revisa que la sesión se abrió con el directorio de trabajo dentro del repo y que el
enlace apunta a una carpeta con `SKILL.md`.

### Claude Code, Cursor y Codex CLI (documentado, no probado aquí)

Los tres ejecutan comandos en Windows, así que pueden hacer todo el flujo; la diferencia es cómo les
llega el contexto. No cargan skills de DSH: se les da el prompt de [AI_SETUP_PROMPT.md](AI_SETUP_PROMPT.md)
(bloque español) y trabajan con los archivos del repo.

Texto mínimo de handoff para un agente con shell:

```text
Lee AI_SETUP_PROMPT.md de este repo y ejecútalo al pie de la letra en Windows. Empieza con
`powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report`; si hay blockers, mapa el texto
contra doctor-fixes.json y corrige uno por uno. Termina con
`node tools/verify-receipt.mjs doctor-report.json` y pega su salida. Nunca expongas el puente a
Internet, no imprimas la clave de acceso y no ejecutes el kill switch.
```

Detalles por agente:

- **Claude Code**: pide permiso por cada comando; conviene aprobar PowerShell y `node` de una vez.
  Si no encuentra `node`, pasa la ruta absoluta del runtime (`%USERPROFILE%\.dsh\dsh-runtimes\...`).
- **Cursor**: usa el modo agente con el repo abierto; la terminal integrada es la que ejecuta el
  doctor. No usa `.dsh/skills`, así que el prompt es obligatorio.
- **Codex CLI**: arranca en la raíz del repo para que lea `doctor.ps1` y `doctor-fixes.json`. Su
  sandbox de red puede impedir consultar el puente y GitHub: pide permiso de red o ejecuta el doctor
  con el usuario y pégale la salida.

### ChatGPT y asistentes sin shell; modelos locales (documentado)

No pueden ejecutar nada en la computadora. El reparto es: el usuario ejecuta, el asistente interpreta.
El recibo es justo lo que hace útil ese reparto: el JSON se puede comprobar y pegar sin ambigüedad.

```powershell
# 1. El usuario genera el informe (sin BOM, con recibo)
powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report

# 2. El usuario verifica el recibo y pega esta salida
node tools/verify-receipt.mjs doctor-report.json

# 3. Opcional: exigir el APK publicado y la huella del certificado de release
node tools/verify-receipt.mjs doctor-report.json `
  --expect-apk-sha256 7f0e6922033a04c4d8da55037a99c4e4821e7b5b5633d17697f5a456ac74760e `
  --expect-cert 4F:E1:AD:C0:45:71:AF:2B:89:1B:E4:6B:1B:3C:86:39:65:F6:73:A6:B7:25:87:61:47:96:91:7F:49:63:65:23
```

El SHA-256 de la 5.4.0 (`74d6a8c1…a701848`) se toma del campo `apkSha256` de `RELEASES.json` una
vez compilada la build; no se inventa ni se copia de una versión anterior. La verificación de esa
build da 418 comprobaciones en total: 416 se ejecutan en CI y 2 se omiten allí por el APK no versionado (además, 3 suites omitidas con motivo:
2 por el APK gitignored y 1 por ser exclusiva de Windows), más 915 comprobaciones Java ejecutadas en
local.

Texto mínimo de handoff para un asistente sin shell:

```text
Te pego la salida de `powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report` y de
`node tools/verify-receipt.mjs doctor-report.json`. Primero dime si el recibo es válido; después
mapea cada blocker contra doctor-fixes.json y dame los pasos exactos. No inventes IPs ni versiones.
```

Los modelos locales entran en esta misma fila salvo que su host tenga ejecución de herramientas; en
ese caso se comportan como un agente con shell y aplican las advertencias de la sección anterior.

### El recibo del informe

`doctor.ps1 -Report` escribe `doctor-report.json` sin BOM con estos campos añadidos:

| Campo | Contenido |
| --- | --- |
| `apkSha256` | SHA-256 del APK que el puente sirve de verdad, calculado en vivo desde `/dsh-companion/status` |
| `apkVersion` | Versión del APK anunciada por el puente (`5.4.0` en la release actual) |
| `apkVersionCode` | `versionCode` de Android anunciado por el puente (`67` en la release actual) |
| `certSha256Release` | Huella documental del certificado del keystore de release (la de README y SECURITY.md) |
| `receipt` | `algorithm` (`sha256`), `canonical` (`json-compact-sin-receipt`) y `sha256` del informe |

El canon exacto está documentado en la cabecera de [tools/verify-receipt.mjs](tools/verify-receipt.mjs):
se hashea `JSON.stringify(JSON.parse(archivo) sin la clave receipt)`, es decir el JSON compacto del
informe con sus claves en orden. La indentación no importa y los escapes de PowerShell 5.1 tampoco
estorban, porque se normaliza el valor.

El recibo prueba **integridad del contenido escrito** (nadie cambió un campo después de generarlo),
no autenticidad: no es una firma y cualquiera puede generar un informe nuevo. Para atar el entorno a
la release publicada se usan `--expect-apk-sha256` y `--expect-cert`.

### Lo que no está probado (huecos)

- **Solo DSH está probado en esta máquina.** Claude Code, Cursor, Codex CLI, ChatGPT y los modelos
  locales aparecen documentados: si algo falla con ellos, es un hueco de esta matriz, no del doctor.
- **No se probó el flujo de instalación completo desde otro agente.** El doctor, el recibo y el mapa
  de fallos sí se ejecutaron; emparejar el teléfono, abrir el panel y probar avisos lo hizo el
  usuario y no se repitió con cada agente.
- **La carga de la skill en una sesión DSH nueva no se repitió en esta pasada.** El junction existe y
  DSH documenta esas raíces; la apertura de sesión es lo único que no se volvió a probar aquí.
- **macOS y Linux no se probaron.** El doctor se probó en Windows; los instaladores para macOS y
  Linux existen pero no se ejecutaron en esta máquina.
- **Un informe de una versión anterior del doctor no tiene recibo.** `verify-receipt.mjs` falla por
  diseño; la solución es regenerarlo con el doctor actual.
- **La espera del puente no está cubierta.** Si el puente no responde, el recibo sigue siendo válido
  pero `apkSha256` y `apkVersion` salen vacíos; usa `--expect-apk-sha256` si necesitas exigir el APK.

### Otros documentos

- [README.es.md](README.es.md) — instalación y uso.
- [AI_SETUP_PROMPT.md](AI_SETUP_PROMPT.md) — el prompt completo, en inglés y en español.
- [doctor.ps1](doctor.ps1) — el diagnóstico y el recibo.
- [doctor-fixes.json](doctor-fixes.json) — fallo a solución.
- [skills/mobile-companion-setup/SKILL.md](skills/mobile-companion-setup/SKILL.md) — el procedimiento como skill.
