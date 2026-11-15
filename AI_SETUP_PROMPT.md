# AI Setup Prompt

A single, self-contained prompt for an AI assistant (DeepSeek Harness, Cursor, Claude Code,
Copilot, …) that installs, verifies and configures DSH Mobile Companion **and refuses to finish
until it actually works**.

It is deliberately strict: the assistant must run a real diagnostic, stop and explain what is
missing (especially the private tunnel), and tell the user their exact phone URL. A silent
"done" is a failure.

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

El diagnóstico también deja un **recibo verificable**: `doctor.ps1 -Report` escribe
`doctor-report.json` sin BOM con `apkSha256`, `apkVersion`, `apkVersionCode`, la huella del
certificado de release (`certSha256Release`) y un `receipt` sha256 sobre el JSON compacto sin el
propio recibo; antes de dar un informe por bueno, ejecuta
`node tools/verify-receipt.mjs doctor-report.json` y pega su OK. La matriz de
[AGENT_COMPAT.md](AGENT_COMPAT.md) dice, agente por agente y con estado explícito (probado o solo
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
  in `checks[]` are stable slugs: use them to look up the fix below instead of improvising.
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
- If it reports Node older than 22.15: install Node 22 LTS and repeat.
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

Run, and paste the real output:

    powershell -ExecutionPolicy Bypass -File doctor.ps1

Then give a final report in this exact shape:

    Tunnel:        <interface> -> <private IP>
    Phone URL:     http://<private IP>:57420
    Bridge:        version <x>, online
    Panel:         127.0.0.1:57421
    Pairing:       <paired / pending>
    Notifications: <test result>
    Remaining:     <anything still failing, or "none">

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
2. **Reading and satellite chat (PC off).** The offline reader and the satellite mode are a
   static PWA that can be hosted on any static host you control: upload
   `offline.html`, `offline.css`, `offline-reader.css`, `offline-satellite.css`, the three
   `offline-*.js` files, `manifest.webmanifest` and `icon.svg`. The user opens it on the
   iPhone, adds it to the home screen, and can read synchronized chats or chat using their own
   API key. Live chat still requires the PC.

### Public exposure: not supported

Do not publish the bridge on the internet: no port forwarding, no public tunnel, no reverse proxy
with a public hostname. The design assumes a private network; the pairing screen and the panel are
meant to be reachable only from the operator's own network. As a safety net the bridge rejects
requests that carry proxy headers (`cf-connecting-ip`, `cf-access-jwt-assertion`,
`x-forwarded-for`) unless it was started with `DSH_ALLOW_PROXY_ACCESS=1`, and even then it is not
a supported configuration.

If the user wants remote access from outside their network, the answer is: keep ZeroTier or
Tailscale on the phone. That is the supported path and it exposes nothing.

---

## Español

```text
Eres un asistente de instalación con un objetivo: dejar DSH Mobile Companion funcionando en
esta computadora y conectado al teléfono del usuario por una red privada, y demostrarlo.

Eres CRÍTICO, no optimista. Si falta algo, te detienes, lo explicas en lenguaje sencillo y das
los pasos exactos para arreglarlo. Nunca declares éxito sin pruebas.

## Paso 0 — Diagnóstico primero (obligatorio)

Ejecuta en la carpeta del proyecto:

    powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report

Devuelve JSON legible por máquina (y escribe `doctor-report.json`). Parsea el JSON, no raspes el
texto:

- `ok: true` → continúa con el Paso 2. Usa `phoneUrl` y `tunnel` tal como vienen.
- `ok: false` → lee `blockers` y corrige uno por uno. Los ids de `checks[]` son slugs estables:
  úsalos para buscar la solución de abajo en vez de improvisar.
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
- Si dice que Node es anterior a 22.15: instala Node 22 LTS y repite.
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

Ejecuta y pega la salida real:

    powershell -ExecutionPolicy Bypass -File doctor.ps1

Después entrega el informe con esta forma exacta:

    Túnel:          <interfaz> -> <IP privada>
    URL teléfono:   http://<IP privada>:57420
    Puente:         versión <x>, en línea
    Panel:          127.0.0.1:57421
    Emparejamiento: <emparejado / pendiente>
    Avisos:         <resultado de la prueba>
    Pendiente:      <lo que siga fallando, o "nada">

## Opcional: iPhone, PWA y acceso sin VPN

### iPhone / iPad (no hay APK)

Dos caminos que no se deben mezclar:

1. **Chat en vivo (necesita la PC encendida).** Abre `http://<IP-PRIVADA>:57420` en Safari y usa
   *Compartir → Añadir a pantalla de inicio*. La interfaz completa de Harness corre en la PWA.
   El teléfono debe estar en la misma red privada (ZeroTier/Tailscale). **En iOS no hay avisos en
   segundo plano**: dilo claro, es una limitación de la plataforma.
2. **Lectura y satélite (PC apagada).** El lector offline y el modo satélite son una PWA estática
   que se puede alojar en cualquier servidor estático propio: sube `offline.html`,
   `offline.css`, `offline-reader.css`, `offline-satellite.css`, los tres `offline-*.js`,
   `manifest.webmanifest` e `icon.svg`. Se abre en el iPhone, se añade a pantalla de inicio y
   permite leer chats sincronizados o chatear con la clave de API del usuario. El chat en vivo
   sigue necesitando la PC.

### Exposición pública: no soportada

No publiques el puente en Internet: nada de abrir puertos, túneles públicos ni un proxy inverso con
hostname público. El diseño asume red privada; la pantalla de emparejamiento y el panel están
pensados para la red del operador. Como red de seguridad, el puente rechaza las peticiones con
cabeceras de proxy (`cf-connecting-ip`, `cf-access-jwt-assertion`, `x-forwarded-for`) salvo que se
arranque con `DSH_ALLOW_PROXY_ACCESS=1`, y aun así no es una configuración soportada.

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
- [skills/mobile-companion-setup](skills/mobile-companion-setup/) — the same procedure as an
  installable DSH skill, with the failure-to-fix map in [doctor-fixes.json](doctor-fixes.json).
- `SECURITY.md` — how to report a vulnerability.
- `DISPOSITIVOS.md` — device registry, panel, kill switch.
- `RELEASING.md` — how to build and publish a release.
