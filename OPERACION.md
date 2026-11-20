# Operación y soporte remoto

Guía para operar **DSH Mobile Companion 5.4.0** (versionCode 68) y dar soporte cuando la
computadora no está delante. El uso normal ocurre dentro de la red privada (ZeroTier, Tailscale u
otra): el teléfono abre `http://<IP-PRIVADA>:57420`. El panel de aprobación escucha **solo en
`127.0.0.1:57421`** y el puente **nunca se expone a Internet**: no se abre un puerto en el router,
no hay DNS público ni túnel público detrás.

Documentos relacionados: [CHECKLIST-VERIFICACION.md](CHECKLIST-VERIFICACION.md) (verificación completa desde
el teléfono), [SUPPORT.md](SUPPORT.md) (política de soporte y evidencia), [SECURITY.md](SECURITY.md),
[DISPOSITIVOS.md](DISPOSITIVOS.md) y [VPN_OPTIONS.md](VPN_OPTIONS.md) (redes privadas compatibles).

## Lo que se puede resolver sin la computadora delante

| Tarea | Desde el teléfono | Hace falta la computadora |
| --- | --- | --- |
| Ver salud y versión | Sí: `/healthz` y `/dsh-companion/status` | No |
| Aprobar, nombrar o revocar dispositivos | No: el panel es solo local | Sí: `panel.bat` (o escritorio remoto) |
| Cambiar la PC activa y ejecutar el kill switch por PC | Sí: Hub del teléfono | No (solo requiere que la PC esté encendida) |
| Arrancar, reiniciar o detener el puente | No | Sí: `start.bat`, `stop.bat`, `install-autostart.bat` |
| Revisar los registros | No | Sí: `bridge.log` |
| Copiar o restaurar los datos de acceso | No | Sí: [backup.bat](backup.bat), [restore.bat](restore.bat) |
| Diagnóstico oficial del entorno | No | Sí: `doctor.ps1 -Json -Report` |
| Actualizar el APK | Sí: página *Actualizar* o GitHub Releases | No |
| Soporte guiado de pantalla | Opcional: RustDesk (ver sección 8) | Sí, para ejecutar los pasos |

Regla de oro: **ningún atajo remoto sustituye al panel local**. El código de 4 dígitos solo se
aprueba desde `127.0.0.1`; si no hay nadie delante de la computadora, hace falta un escritorio
remoto (sección 8) o alguien que ejecute `panel.bat` en el equipo.

## 1. Comprobar la salud desde el teléfono

Abre en el navegador del teléfono, con la VPN activa, `http://<IP-PRIVADA>:57420/healthz`. No pide
credenciales y solo devuelve versiones, puertos privados y estado: nunca claves ni cookies. Responde
JSON con el estado del **puente**, del **backend de DeepSeek Harness** y el `contract`: la lista de
piezas de Harness que se comprobaron y cómo respondió cada una.

- `status: "ok"` y HTTP 200: puente y Harness responden.
- HTTP 503 o `status: "down"`: el puente está vivo pero Harness no. Abre DeepSeek Harness en la
  computadora, espera a que termine de cargar y vuelve a consultar.
- `status: "degraded"` (HTTP 200) o alguna pieza del `contract` en `degraded`: el puente y Harness
  están arriba, pero una función asociada (avisos, aprobaciones, etc.) puede no responder. Anota el
  nombre exacto de la pieza para el informe.
- Sin respuesta o error de conexión: el puente no está escuchando (sección 3) o el teléfono perdió
  la red privada.

Usa `/healthz` para comprobaciones puntuales, no para monitorizarlo en bucle: el puente limita la
frecuencia por IP y responde `429` si se abusa.

`/dsh-companion/status` (requiere un dispositivo emparejado o la clave) confirma `version`,
`apkVersion`/`apkVersionCode`, `dshOnline`, `targetPort` y el bloque de contrato de Harness que el
puente comprobó. Es la fuente más fiable para copiar la versión exacta en un informe de soporte.

## 2. Aprobar un dispositivo nuevo

1. Teléfono: instala el APK, abre la app y escribe la dirección `http://<IP-PRIVADA>:57420`. La app
   muestra un código de 4 dígitos y la pantalla "Confirma en la computadora".
2. Computadora: ejecuta `panel.bat`. Si el puente está arrancado, el panel también se abre solo
   cuando el teléfono empieza a esperar aprobación; `panel.bat` solo lo enfoca si ya estaba abierto.
   El panel escucha **estrictamente en `127.0.0.1:57421`**.
3. Comprueba que el código del panel coincide con el del teléfono y pulsa **Autorizar**. Puedes
   ponerle un nombre al dispositivo ("Pixel de…"), elegir rol `Control total` o `Solo lectura`, y
   fijar un puerto de destino propio si esa persona debe usar otra instancia de Harness.
4. El teléfono entra solo y no vuelve a preguntar. La sesión dura **30 días y se renueva con el
   uso**; los dispositivos vencidos se rechazan y se purgan.

Si no estás delante de la computadora: usa el escritorio remoto de la sección 8 para abrir
`panel.bat`, o pide a alguien que esté en el equipo que lo ejecute y te lea el código. **No
apruebes nunca un código que no esperabas**: el panel también permite revocar y el teléfono tiene
el interruptor de seguridad.

Revocación: el panel permite revocar un dispositivo o **Revocar todos**. En el teléfono, el
interruptor de seguridad revoca los dispositivos de la **PC activa**, cierra sus túneles WebSocket
**y rota su clave de acceso**: después de usarlo, todo lo emparejado con esa PC debe aprobarse de
nuevo. Úsalo solo si sospechas que un dispositivo se perdió; no es un botón de reinicio. Con varias
PC registradas, ejecútalo en cada una (sección 2b).

## 2b. Varias computadoras (multi-PC)

El teléfono puede guardar **varias computadoras** y cambiar entre ellas sin recompilar nada. Cada
una es un perímetro independiente:

- **Registro y credenciales por PC**: cada computadora tiene su propio puente, registro de
  dispositivos, clave de acceso y cookie de sesión. El teléfono las guarda separadas y solo usa la
  que está **activa**.
- **Cambiar de PC**: en el Hub del teléfono, sección *Equipos*, elige la computadora; también se
  añade una nueva por QR o a mano. El QR de una PC no sirve para otra.
- **Puerto de destino por dispositivo**: en el panel se puede fijar un `targetPort` para que un
  dispositivo use otra instancia de Harness del mismo equipo; no es una PC distinta.
- **Kill switch por PC**: el interruptor de seguridad se envía solo al puente de la PC activa
  (`/dsh-companion/kill-switch` de ese equipo). Revoca los dispositivos y la clave de esa PC; las
  demás conservan sus sesiones. Si se pierde el teléfono, ejecútalo en **cada** computadora.
- **No bloquea el reemparejamiento**: tras un kill switch, «Abrir panel» y el emparejamiento de la
  misma PC siguen funcionando; solo hay que aprobar de nuevo.
- **Firewall por PC**: cada computadora aplica su propia regla de firewall para su subred de VPN
  (sección 11). El teléfono no puede abrir ni cerrar puertos de la computadora.

## 3. Arrancar, reiniciar y detener el puente (Windows)

- `install-autostart.bat`: registra el arranque con Windows **y arranca el puente ahora**. Se usa
  una sola vez; no ejecutes además `run-hidden.vbs` (un segundo proceso solo falla con
  `EADDRINUSE`).
- `start.bat`: arranca el puente en segundo plano a través de `run-hidden.vbs`.
- `stop.bat`: lo detiene sin afectar a otros programas y deja una marca para que el supervisor no
  lo resucite mientras se para.
- Reiniciar: `stop.bat` y después `start.bat`. No hace falta desinstalar el arranque automático.

Para comprobar que arrancó: desde el teléfono, `/healthz`; en la computadora, las últimas líneas de
`bridge.log` (`DSH Companion <versión> activo`, `Interfaz … -> http://<IP-PRIVADA>:57420`) o
`doctor.ps1`. Si la IP privada de la VPN cambia (reconexión de ZeroTier/Tailscale), el puente
vuelve a enlazarse solo en unos 15 segundos: no hace falta reiniciarlo.

macOS y Linux: `install-launchd.sh` / `install-systemd.sh` para el arranque,
`uninstall-launchd.sh` / `uninstall-systemd.sh` para quitarlo. Las copias de la sección 6 y las
tareas de esta sección son para Windows.

## 4. Revisar los registros (logs)

- `bridge.log` está en la carpeta del proyecto. Se escribe cuando el puente se lanza con
  `run-hidden.vbs` (`cmd /c node bridge.mjs >> bridge.log 2>&1`).
- Rotación en caliente: al alcanzar el tamaño máximo, el contenido pasa a `bridge.log.1` y se
  desplazan `bridge.log.2`, `bridge.log.3`… conservando los N más recientes. Se ajusta con dos
  variables de entorno definidas **antes** de arrancar el puente:
  - `DSH_LOG_MAX_MB`: tamaño máximo en MB (predeterminado `5`, mínimo `1`).
  - `DSH_LOG_KEEP`: archivos rotados que se conservan (predeterminado `3`, entre `1` y `10`).
  Un valor inválido no impide arrancar: se avisa y se usa el predeterminado.
- Qué mirar: líneas `[bridge]` (arranque, reenlace de IP, cierre) y `[ws]` (túneles, rechazos);
  avisos de rotación (`bridge.log superaba …`); `La IP privada cambio: … -> … (interfaz)`.
- Qué **no** pegar en un issue o en un chat: el archivo completo. Contiene IP privadas, nombres de
  dispositivos y rutas del perfil de usuario. Copia solo las líneas relevantes y tacha la IP
  (`<IP-PRIVADA>`) y los nombres. La clave de acceso nunca aparece completa: solo sus 4 últimos
  caracteres.

Si el archivo crece sin control, comprueba que el puente lleva arrancado desde la 5.1.5 o posterior
(la rotación en caliente se instaló en esa versión) y que no hay un `bridge.log.1.tmp` de una
rotación interrumpida por un corte de luz: en ese caso se reintenta solo en 60 segundos.

## 5. Diagnóstico oficial con doctor.ps1

En la carpeta del proyecto, en la computadora:

```powershell
powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report
```

- `-Json` devuelve JSON legible por máquina y `-Report` escribe `doctor-report.json`.
- Campos clave: `ok`, `blockers`, `warnings`, `checks[]`, `phoneUrl`, `tunnel`, `bridgeVersion`,
  `apkSha256` y `receipt`.
- `ok: true` con `blockers` vacío: no hay bloqueos del entorno. Los `warnings` no bloquean, pero
  léelos (por ejemplo, firewall sin permisos para consultarlo).
- Código de salida `0` = listo, `1` = falta algo; el propio informe explica qué.
- Desde 5.2.0 el doctor también revisa la última copia de seguridad: si no hay ninguna o tiene más
  de 7 días, avisa y sugiere ejecutar [backup.bat](backup.bat) (sección 6).

Verifica el recibo antes de enviar el informe:

```powershell
node tools/verify-receipt.mjs doctor-report.json
```

Si el recibo es válido, incluye el archivo `doctor-report.json` completo junto con la versión y el
texto del error. El recibo demuestra que el informe no se editó a mano después de generarlo.

## 6. Copias de seguridad: registro, clave y token del panel

Los tres datos que no se pueden reconstruir sin volver a emparejar viven en `%USERPROFILE%\.dsh`
(o en `%DSH_HOME%`): el registro de dispositivos (`companion-devices.json`), la clave de acceso
manual (`companion-access-key`) y el token del panel (`companion-panel-token`).

- [backup.bat](backup.bat) (doble clic): crea una carpeta nueva en `.dsh\backups\<AAAA-MM-DD-HHMMSS>\` con
  una copia de cada archivo existente, más un manifiesto con fecha, origen, tamaño y SHA-256 de
  cada copia. Verifica cada hash contra el original; si algo no coincide, da error y no lo declara
  como copia buena. Nunca imprime secretos.
- [restore.bat](restore.bat) (doble clic): restaura la copia válida más reciente por defecto (las
  automáticas que terminan en `-pre-restore` no se eligen solas). Verifica primero el
  manifiesto: si un hash no coincide, **rechaza la restauración sin tocar los archivos actuales**.
  Antes de escribir guarda el estado actual en `.dsh\backups\<AAAA-MM-DD-HHMMSS>-pre-restore`, de
  modo que se puede volver atrás. Para elegir otra copia: `restore.bat -From <carpeta>`.
- Opciones para pruebas: `backup.ps1 -DryRun` (no escribe nada), `backup.ps1 -RegistryOnly` (solo el
  registro de dispositivos) y `backup.ps1 -DshHome <carpeta>` para trabajar sobre un DSH_HOME
  temporal sin tocar el real.

Cuándo ejecutarlo: después de dejar el emparejamiento a punto, antes de cambiar de máquina o de
disco, antes de usar el interruptor de seguridad y siempre que el doctor avise de una copia vieja.
Después de restaurar, reinicia el puente para que cargue el estado restaurado.

La copia **contiene credenciales**: guárdala cifrada o en un medio offline, y no la envíes por
chat, correo ni repositorio. No incluye conversaciones (`synced_chats/`), el APK ni la
configuración de Harness; para esos datos usa la copia del sistema que corresponda. La copia no
sustituye a BitLocker en equipos compartidos.

## 7. Actualizar el APK

1. En el teléfono, con la VPN activa, abre `http://<IP-PRIVADA>:57420/` y entra en *Actualizar*: la
   página muestra la versión publicada (5.4.0, versionCode 68) y el SHA-256 del APK.
2. Descárgalo, comprueba que la huella coincide con la publicada (también está en la página de
   GitHub Releases y en el campo `apkSha256` de `/dsh-companion/status` una vez emparejado) y
   instálalo encima. Desde la 5.1.7 la firma es la misma y se instala encima sin desinstalar; si
   vienes de la 5.1.6 o anterior, desinstala una vez.
3. No instales un APK que no venga de la página del puente o de GitHub Releases con la huella
   correcta. La huella del certificado de release está en [SECURITY.md](SECURITY.md).
4. Después de instalar: abre la app, comprueba la versión en Ajustes, `http://<IP-PRIVADA>:57420/healthz`
   y envía una notificación de prueba. El servidor no necesita reinicio por actualizar el APK.

## 8. Soporte remoto con RustDesk (opcional, no forma parte del producto)

Cuando el problema exige ver o manejar el escritorio de la computadora, una opción es
[RustDesk](https://rustdesk.com), una herramienta de escritorio remoto de terceros. Es solo una
**recomendación de soporte**: no se empaqueta con el producto, no se instala con los scripts del
repositorio, no va dentro del APK y no es necesaria para que el puente funcione. El proyecto no da
soporte de RustDesk; si falla, se resuelve con su documentación.

Si se usa, con estas condiciones:

- **Servidor self-hosted o solo sobre la red privada.** Usa un servidor propio (los componentes
  `hbbs`/`hbbr`) o accede únicamente a través de ZeroTier/Tailscale. No dejes el acceso remoto
  abierto a Internet más tiempo del necesario y no expongas los puertos del puente (57420) ni del
  panel (57421) por ese camino.
- **Contraseña permanente fuerte y 2FA.** Una contraseña larga y única (generada con un gestor),
  no reutilizada, y verificación en dos pasos activada en la cuenta de RustDesk. Cambia la
  contraseña de sesión después de cada soporte y no la compartas por chat ni la dejes escrita.
- **Apágalo cuando no se use.** Cierra RustDesk y desactiva el acceso no atendido al terminar.
  No dejes una sesión permanente abierta "por si acaso".
- **Minimiza lo que se ve.** Durante la sesión se ve todo el escritorio: cierra el panel, claves,
  correo y cualquier ventana sensible; no escribas ni pegues la clave de acceso en pantalla. Quien
  da el soporte debe pedir permiso antes de tocar algo y decir qué va a hacer.

Alternativa sin instalar nada: compartir pantalla con una videollamada, o guiar paso a paso a la
persona que tiene la computadora delante. Para aprobar un dispositivo basta con `panel.bat`; no
hace falta escritorio remoto.

## 9. Qué hacer si algo falla

| Síntoma | Comprobar | Acción |
| --- | --- | --- |
| El teléfono no abre la URL del puente | VPN activa en el teléfono y en la computadora; `/healthz` desde otro equipo de la red | Reconectar la VPN; si la IP cambió, el puente se reenlaza solo; revisar `bridge.log` |
| `/healthz` no responde nada | ¿El puente está corriendo? | `start.bat` o `install-autostart.bat`; revisar las últimas líneas de `bridge.log` |
| `/healthz` responde 503 o `down` | El puente está vivo; Harness no | Abrir DeepSeek Harness en la computadora y esperar; consultar de nuevo |
| El `contract` muestra piezas `degraded` | Nombre exacto de la pieza | Anotarlo en el informe; puede afectar avisos o aprobaciones |
| El teléfono se queda en "Confirma en la computadora" | El panel está abierto y los códigos coinciden | Ejecutar `panel.bat`; aprobar el código esperado |
| "Acceso denegado" o el teléfono pide aprobación otra vez | Dispositivo revocado, vencido o clave rotada | Aprobar de nuevo desde `panel.bat` |
| No llegan los avisos de fin de turno | Interruptor en Ajustes, exención de batería, prueba desde la PC | Repetir la prueba; si falla, revisar `bridge.log` y la versión de Harness |
| El puente no arranca | `doctor.ps1 -Json -Report`; ¿ya estaba corriendo? | Si hay `EADDRINUSE`, `stop.bat` y `start.bat`; si no, seguir los `blockers` del doctor |
| `bridge.log` crece demasiado | Rotación y `DSH_LOG_MAX_MB`/`DSH_LOG_KEEP` | Ajustar las variables y reiniciar; el aviso de rotación aparece en el propio log |

## 10. Documentos de referencia

- [CHECKLIST-VERIFICACION.md](CHECKLIST-VERIFICACION.md): lista de comprobación completa desde el teléfono.
- [SUPPORT.md](SUPPORT.md): política de soporte y qué evidencia enviar.
- [SECURITY.md](SECURITY.md): cómo reportar una vulnerabilidad y huella del certificado.
- [DISPOSITIVOS.md](DISPOSITIVOS.md): flujo del panel, roles y revocación.
- [AI_SETUP_PROMPT.md](AI_SETUP_PROMPT.md): instalación guiada por un agente de IA.
- [VPN_OPTIONS.md](VPN_OPTIONS.md): redes privadas compatibles y cómo se detectan.
- [RELEASING.md](RELEASING.md): cómo se publica una versión.

## 11. Endurecimiento del entorno (requiere administrador)

Estos pasos **no** los puede hacer el puente por ti: tocan el sistema. Son opcionales pero reducen
la superficie si el equipo se mueve entre redes.

### Firewall: cerrar `node.exe` a un solo puerto y a la subred de la VPN

El instalador de Node suele dejar reglas que permiten **todo** el tráfico entrante a `node.exe`.
Sustitúyelas por una regla de puerto y subred (ajusta la IP del SDK y la subred de tu VPN). Repite
el bloque en **cada PC** del despliegue multi-PC, con su propia subred:

```powershell
# Ejecutar en PowerShell COMO ADMINISTRADOR
$node = "C:\Users\<TU_USUARIO>\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
$vpn  = "10.0.0.0/24"   # la subred de tu VPN (ZeroTier/Tailscale)

# 1) Revisa el estado de entrada: lo correcto es DefaultInboundAction = Block.
Get-NetFirewallProfile | Select-Object Name, DefaultInboundAction

# 2) Quita las reglas amplias del mismo node.exe (revisa antes con Get-NetFirewallRule).
Get-NetFirewallRule -Direction Inbound -Action Allow | Where-Object {
  ($_ | Get-NetFirewallApplicationFilter).Program -like "*dsh-runtimes*"
} | Remove-NetFirewallRule

# 3) Una sola regla: puerto 57420, solo desde la subred de la VPN, sin borde.
New-NetFirewallRule -DisplayName "DSH Companion 57420 (VPN)" -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort 57420 -Program $node -Profile Private,Public -RemoteAddress $vpn `
  -EdgeTraversalPolicy Block
```

Comprobación: `Get-NetFirewallRule | ? DisplayName -like "*DSH Companion*"` debe mostrar **solo**
la regla de 57420, y `Get-NetFirewallRule -Direction Inbound -Action Allow | ? DisplayName -eq
"node.exe"` no debe devolver reglas amplias. El teléfono sigue entrando por la VPN y el panel 57421
no necesita regla (loopback).

Notas de endurecimiento:

- **No añadas una regla de bloqueo para `node.exe`**: en Windows una regla de bloqueo explícita
  gana a la de permiso y dejaría el puente inaccesible. El aislamiento se consigue con el
  `DefaultInboundAction: Block` del perfil y **sin** reglas amplias de permiso.
- Si el equipo se conecta a redes públicas, restringe además la regla a la interfaz de la VPN
  (`-InterfaceAlias "ZeroTier One [...]"` o el nombre de tu adaptador de Tailscale).
- El panel (`57421`) no se publica nunca: escucha solo en loopback y no lleva regla de firewall.
- El puente no abre puertos en el router ni acepta tráfico de fuera de la red privada.

### Secretos en disco

`%USERPROFILE%\.dsh` guarda la clave de acceso, el token del panel y el registro **en claro**. Desde
la 5.2.10 la carpeta tiene herencia desactivada y solo `SYSTEM`, `Administradores` y tu usuario
pueden leerla. No la muevas fuera de tu perfil y no la copies a unidades compartidas. Las copias de
`backups\` heredan los mismos permisos; si necesitas cifrarlas, usa una unidad BitLocker o un
contenedor cifrado, no un ZIP con contraseña.

### Qué no hace este producto (a propósito)

No abre puertos en el router, no usa túneles públicos, no habla con `api.deepseek.com` y no
empaqueta RustDesk. Si algo te pide lo contrario, no es este proyecto.
