---
name: mobile-companion-setup
description: Instala, arranca y verifica DSH Mobile Companion (puente local + cliente móvil) y lo demuestra con evidencia real. Úsala cuando pidan conectar el teléfono con DeepSeek Harness, instalar el companion, emparejar con panel.bat, arrancar el puente, probar avisos o resolver un FAIL/AVISO de doctor.ps1 sin improvisar IPs, puertos ni versiones.
whenToUse: Cargar antes de ejecutar doctor.ps1, install-autostart.bat, panel.bat o start/stop del puente; también cuando el usuario reporte "no conecta", "no hay túnel", "no llegan los avisos" o pida el informe final con evidencia.
metadata:
  project: dsh-mobile-companion
  format: dsh-skill/1
  source: https://github.com/TintaYNodos/dsh-mobile-companion
  requires: Windows PowerShell 5.1 o superior; el repo del proyecto con doctor.ps1
---

# DSH Mobile Companion: instalación verificable

Objetivo: dejar el companion funcionando en esta computadora y conectado al teléfono por una red
privada, y demostrarlo. No es un tutorial: es un procedimiento con puertas. Cada puerta se cierra
con la salida real de un comando; si una no se cierra, te detienes y explicas qué falta.

## 0. Ubica el repo y el mapa

- Trabaja en la raíz del repo: la carpeta que contiene `doctor.ps1`. En lo que sigue, `$RepoRoot`
  es esa carpeta. Si no sabes dónde estás: `git rev-parse --show-toplevel`. Si eso falla, pide la
  ruta al usuario. Nunca inventes la ruta del proyecto.
- El mapa de soluciones está en `$RepoRoot/doctor-fixes.json`. Este fichero de skill solo tiene el
  procedimiento; el mapa es la lista de comandos por mensaje de fallo.
- Antes de confiar en el mapa, audítalo (sin dependencias; localiza el repo solo):

      node skills/mobile-companion-setup/scripts/verify-fixes.mjs static

  Debe terminar con `static check OK`. Si falla, no sigas: el mapa y `doctor.ps1` se
  desincronizaron y hay que corregir el mapa, no improvisar comandos.

## Reglas que no se rompen

- **Nunca inventes** una IP, un túnel, un puerto, una versión ni una URL: todo sale del JSON de
  `doctor.ps1`. Si un campo viene vacío, ese paso está pendiente.
- El puente **nunca** se expone a Internet: nada de abrir puertos en el router, túneles públicos ni
  `DSH_ALLOW_PROXY_ACCESS` sin capa de identidad. Es por diseño.
- No imprimas, copies ni pegues la clave de acceso, el token del panel, las cookies del teléfono ni
  el contenido de `.credentials.yaml`.
- No ejecutes el kill switch ni revoques dispositivos salvo que el usuario lo pida: revoca todos
  los dispositivos y rota la clave.
- No arranques el puente dos veces: `install-autostart.bat` ya lo arranca; un segundo
  `run-hidden.vbs` falla con EADDRINUSE.
- No lances `npm test` contra la instalación real sin avisar: la suite habla con un puente vivo.
- Si un paso falla: párate, pega el comando y su salida real, y busca la solución en el mapa. No
  reintentes a ciegas más de dos veces.

## Flujo por puertas

### G0. Diagnóstico (obligatorio, primero)

      powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report

- Parsea el JSON; no raspes el texto de la consola.
- `ok: true` → pasa a G2 con `phoneUrl` y `tunnel` tal cual vienen.
- `ok: false` → recorre `blockers` y resuelve uno por uno con el mapa (algoritmo en
  `references/fixes.md`). Vuelve a lanzar el diagnóstico tras cada corrección.
- `exit 0` = todo listo; `exit 1` = hay FAIL. Los AVISOS no cambian el código de salida pero pueden
  romper la experiencia (Harness caído, firewall).

### G1. Túnel privado (la puerta que más se atasca)

Si el diagnóstico dice que no hay túnel (`no-private-tunnel`): **PÁRATE**. No inventes una IP y no
continúes. Explícale al usuario, breve:

- El teléfono y la computadora tienen que compartir una red privada; el puente no abre puertos.
- **ZeroTier**: crea una red en https://my.zerotier.com, instala el cliente en la PC y en el
  teléfono, une ambos equipos, marca la red como privada y autoriza cada nodo a mano.
- **Tailscale**: instala el cliente en la PC y en el teléfono y entra con la MISMA cuenta en ambos.
- Vuelve a ejecutar `doctor.ps1`: detectará el túnel y dará la dirección del teléfono.

Si el usuario no quiere instalar un túnel, dilo claro: sin red privada esto no puede funcionar.

### G2. Puente y firewall

- Arranca con `install-autostart.bat` (registra el inicio automático **y** arranca el puente).
- Si el diagnóstico marca el firewall (`firewall-rule-missing`), aplica el comando del mapa como
  administrador y vuelve a diagnosticar. `firewall-query-failed` solo significa que no hubo permisos
  para leerlo.
- Vuelve a `doctor.ps1 -Json`: `bridgeVersion` no vacío y `ok` sin FAIL de puente.

### G3. Emparejamiento con `panel.bat`

- El usuario instala `DSH-Companion.apk` desde Releases o abre `phoneUrl` en el navegador del
  teléfono (también sirve "Añadir a pantalla de inicio").
- El teléfono muestra un código de 4 dígitos y espera.
- En la computadora, ejecuta `panel.bat`. El panel escucha solo en `127.0.0.1` y lista la solicitud
  con el MISMO código; el usuario pulsa **Autorizar**.
- Verifica que el teléfono salga de la pantalla de espera y muestre DeepSeek Harness. Si no,
  comprueba que el panel se abrió (no solo la página) y que los códigos coinciden.

### G4. Avisos desde la PC

- En el teléfono: Ajustes -> "Notificaciones de la PC" (activado).
- Pulsa "Probar desde la PC". Esperado: "Prueba enviada" y un aviso en segundos.
- Si dice que no hay teléfono escuchando, el servicio en primer plano no corre: apaga y enciende el
  interruptor. Si da 403, la clave guardada en el teléfono es vieja: vuelve a emparejar (G3).

### G5. Evidencia e informe (no se cierra sin esto)

1. Vuelve a ejecutar y conserva la salida real:

       powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report
       powershell -ExecutionPolicy Bypass -File doctor.ps1

2. Comprueba que cada mensaje de `blockers`/`warnings` del informe mapea a una entrada:

       node skills/mobile-companion-setup/scripts/verify-fixes.mjs report doctor-report.json

   Si algo sale como `SIN MAPA`, párate y repórtalo: no improvises la solución.
3. Entrega el informe con la forma de `references/report-template.md` y evidencia pegada. Sin
   evidencia, el resultado es "pendiente", no "hecho".

## Cómo leer el JSON del diagnóstico

| Campo | Para qué sirve |
| --- | --- |
| `ok` | `true` solo si no hay ningún FAIL; no mires el texto. |
| `blockers` | Mensajes FAIL que hay que resolver; se mapean con el mapa. |
| `warnings` | Avisos no bloqueantes que pueden romper la experiencia. |
| `checks[]` | Detalle con `id`, `level` y `message`; el `id` es un slug del mensaje (ver nota). |
| `phoneUrl` | Única dirección que se le da al teléfono; sale de aquí, no se construye a mano. |
| `tunnel`, `bindHost` | Interfaz e IP privada reales. |
| `bridgePort`, `panelPort` | Puertos efectivos (por defecto 57420 y 57421). |
| `nodeVersion`, `bridgeVersion` | Versiones reales; no las afirmes de memoria. |
| `generatedAt` | Momento del diagnóstico que vas a citar. |

Nota: `checks[].id` se genera a partir del mensaje y puede incluir rutas, puertos o IPs de esta
máquina; no lo uses como clave estable. Empareja por el texto del mensaje con `matchRuntime` del
mapa. El contrato completo y cómo forzar el caso sin túnel están en
`references/doctor-contract.md`.

## Si un mensaje no está en el mapa

- No improvises: no hay entrada significa "solución desconocida".
- Detente, muestra el mensaje exacto y el comando que lo produjo.
- Los mantenedores añaden el fix en `$RepoRoot/doctor-fixes.json` (formato y auditoría en
  `references/fixes.md`); el agente puede proponer la entrada, pero no aplicarla como si estuviera
  verificada.

## Archivos de apoyo

| Recurso | Contenido |
| --- | --- |
| `references/doctor-contract.md` | Contrato del diagnóstico: campos, códigos de salida y cómo forzar el caso sin túnel. |
| `references/fixes.md` | Cómo mapear cada FAIL/AVISO a `$RepoRoot/doctor-fixes.json` y cómo ampliar el mapa. |
| `references/setup-steps.md` | Comandos exactos por plataforma: arranque, firewall, panel, avisos y parada. |
| `references/report-template.md` | Plantilla y reglas del informe final con evidencia. |
| `scripts/verify-fixes.mjs` | Auditoría estática del mapa y mapeo de un informe JSON real. |
