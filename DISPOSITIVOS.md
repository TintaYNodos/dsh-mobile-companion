# Autorizar dispositivos

El teléfono no pide ninguna clave. La primera vez se aprueba desde la computadora.

## Flujo

```text
1. Abres la app en el teléfono.
2. El teléfono muestra "Confirma en la computadora".
3. En la PC se abre solo el panel (o ejecutas panel.bat).
4. Pulsas Autorizar.
5. El teléfono entra solo. No vuelve a preguntar.
```

La pantalla del teléfono se actualiza por sí misma cada 2 segundos.

## El panel

- Escucha **solo en 127.0.0.1:57421**. No es alcanzable desde la VPN: desde otro
  equipo el puente responde 403.
- Exige su **propia credencial**: un boleto de un solo uso guardado en `%USERPROFILE%\.dsh\companion-panel-token`. Al abrirlo se canjea por una cookie de sesión HttpOnly cuyo identificador solo vive en memoria y caduca a las 12 h; el boleto se regenera en cada canje.
  `panel.bat` la inyecta en la URL y el panel la cambia por una cookie de 12 horas,
  para que el token no quede en el historial.
- Muestra las solicitudes pendientes y los **dispositivos autorizados**.
- Cada dispositivo se puede **nombrar** (por ejemplo "Pixel de Ismael"), **revocar**
  individualmente o revocar todos.
- Cada dispositivo tiene además dos controles:
  - **Rol**: `Control total` (`full`) o `Solo lectura` (`viewer`).
  - **Puerto destino**: vacío = backend por defecto del puente; un puerto fijo
    apunta ese dispositivo a otra instancia de DeepSeek Harness.
- Punto verde si el dispositivo tuvo actividad en los últimos 3 minutos.
- **Actividad reciente**: autorizaciones, rechazos, revocaciones, renombres,
  cambios de rol y de puerto destino, con hora.
- Se refresca solo cada 4 segundos, salvo mientras escribes un nombre.

## Perfil de cada dispositivo

Cada fila de `companion-devices.json` puede llevar dos campos nuevos:

| Campo | Valores | Por defecto | Efecto |
| --- | --- | --- | --- |
| `role` | `full` \| `viewer` | `full` | `full` = comportamiento de siempre. `viewer` = solo lectura (ver abajo) |
| `targetPort` | entero 1024–65535 o `null` | `null` | `null` = backend por defecto del puente. Número = esa instancia de DeepSeek Harness |

Ejemplo de registro:

```json
{
  "devices": [
    {
      "id": "AbCdEf...",
      "name": "Pixel de Ismael",
      "address": "10.0.0.42",
      "agent": "Android 14",
      "approvedAt": "2026-11-15T18:00:00.000Z",
      "lastSeen": "2026-11-15T19:00:00.000Z",
      "lastRefresh": "2026-11-15T19:00:00.000Z",
      "claimed": true,
      "role": "viewer",
      "targetPort": 52711
    }
  ],
  "pending": [],
  "history": [],
  "denied": []
}
```

### Migración

Los registros anteriores a los perfiles no traen estos campos. Se leen como
`role: "full"` y `targetPort: null`, es decir **exactamente el comportamiento
anterior**: nada se degrada ni se bloquea al actualizar el puente. Los valores
nuevos se persisten la próxima vez que el puente guarde el registro (por
ejemplo, al renombrar, aprobar o cambiar un perfil). Un `role` desconocido
también se lee como `full`; `viewer` solo se aplica cuando está escrito
exactamente así.

### Acciones nuevas del panel

Se ejecutan con la sesión del panel (cookie HttpOnly), desde la computadora,
con las mismas comprobaciones de `Host`, `Origin` y `Referer` que el resto de
acciones del panel:

| Acción | Formulario | Resultado |
| --- | --- | --- |
| `POST /pair/set-role` | `id`, `role` (`full`\|`viewer`) | Guarda el rol y lo registra en el historial |
| `POST /pair/set-target` | `id`, `targetPort` (vacío = borrar) | Comprueba el puerto con el sondeo de DeepSeek Harness; si no responde, **no guarda** y avisa |

El panel no publica estas acciones por la red privada: responden 403 sin sesión
de panel, y el panel solo escucha en loopback. Un teléfono emparejado no puede
cambiar su propio perfil.

## Multi-instancia: dos DeepSeek Harness con una sola instalación

El puente puede reenviar cada dispositivo a una instancia distinta. Basta con
arrancar dos instancias de DeepSeek Harness en la misma computadora (por
ejemplo `dsh web --port 52710` y `dsh web --port 52711`) y fijar el **puerto
destino** de cada dispositivo desde el panel:

- Dispositivo "PC de escritorio" → `targetPort` vacío (backend por defecto del
  puente, `DSH_TARGET_PORT` o el que se descubra solo).
- Dispositivo "Tablet de pruebas" → `targetPort` = `52711`.

El puerto se resuelve **por petición**:

1. Si el dispositivo no tiene `targetPort`, se usa la resolución de siempre
   (cache corta de 20 s, candidatos y descubrimiento dinámico). Con el registro
   vacío el comportamiento es idéntico al anterior.
2. Si el dispositivo tiene `targetPort` y ese puerto responde como DeepSeek
   Harness, se usa ese puerto.
3. Si el puerto fijo **no responde**, se cae al backend por defecto y el fallo
   queda en `bridge.log` con el puerto y el nombre/dirección del dispositivo
   (nunca con credenciales). El aviso se repite como mucho una vez por minuto.

La misma regla se aplica a HTTP y al WebSocket (`/api/remote.mux`): un
dispositivo con puerto fijo abre su túnel contra esa instancia, no contra la
del resto.

El campo solo cambia el **puerto**; el host sigue siendo `config.targetHost`
(127.0.0.1), porque el túnel del puente siempre habla con servicios locales.
Para dos computadoras distintas cada una corre su propio puente.

## Perfil `viewer`: solo lectura desde el teléfono

Un dispositivo `viewer` sigue viendo el estado y puede leer, pero el puente
rechaza sus escrituras antes de llegar a DeepSeek Harness. La respuesta es
siempre:

```http
HTTP/1.1 403
Content-Type: application/json

{ "error": "dispositivo en solo lectura" }
```

Y queda registrada en `bridge.log` sin secretos. Se rechazan:

- `POST /dsh-companion/sync` (escribe conversaciones en el disco del host).
- `POST /dsh-companion/absorb-satellite` (escribe notas satélite).
- `POST /dsh-companion/notification-action` y `POST /dsh-companion/action`
  (aprobar/rechazar dispositivos).
- `POST /dsh-companion/kill-switch`.
- `POST /dsh-companion/pc-events/test`.
- Todos los métodos mutantes del proxy hacia DeepSeek Harness (`POST`, `PUT`,
  `PATCH`, `DELETE`) salvo el allowlist de lecturas.

### Allowlist del viewer

DeepSeek Harness transporta **toda** llamada Remote unaria como
`POST /api/<namespace>/<metodo>`, incluidas las lecturas. Bloquear todo POST
dejaría al viewer sin interfaz, así que se permite este subconjunto mínimo de
lecturas:

| Endpoint | Por qué es lectura |
| --- | --- |
| `POST /api/session/list` | Lista de sesiones |
| `POST /api/session/page` | Página de mensajes de una sesión |
| `POST /api/session/projections` | Proyecciones de solo lectura de la sesión |
| `POST /api/session/state` | Estado pasivo (en ejecución / cola / pendientes) |
| `POST /api/session/wait` | Espera el estado pasivo y devuelve salida acotada |
| `POST /api/session/modelCatalog` | Catálogo de modelos |
| `POST /api/session/canOpenWorkspacePath` | Consulta si una ruta se puede abrir |
| `POST /api/session/attachment` | Lee una imagen adjunta de una sesión visible |
| `POST /api/skills/list` | Lista de skills disponibles |
| `POST /api/commands/list` | Lista de comandos de barra |
| `POST /api/llm/listProviders` | Catálogo de proveedores |
| `POST /api/llm/listConfigurableProviders` | Catálogo de proveedores configurables |
| `POST /api/goals/get` | Lee el objetivo de una sesión |

La lista se apoya en la clasificación de endpoints que el propio DeepSeek
Harness usa para sus lectores compartidos (LiveShare): `reader-global-read` y
`reader-session-read`. Se excluyen a propósito `fileUploads/upload` (escribe
adjuntos) y todo lo que DeepSeek Harness clasifica como `owner-only`.
Cualquier endpoint que no esté en la tabla se rechaza por defecto: si una
versión nueva de DeepSeek Harness agrega una lectura por POST, el viewer
tendrá que esperar a que se agregue aquí.

Esto es intencionado y es la parte más importante de este perfil: **la
ausencia de un endpoint en el allowlist no rompe la seguridad, solo la
lectura**.

### Aprobaciones de herramientas

El navegador responde las aprobaciones de herramientas (y las preguntas del
agente) por `POST /api/$events/result`. Esa ruta **no** está en el allowlist,
así que un `viewer` no puede aprobar ni rechazar herramientas desde el
teléfono: el puente responde 403 antes de que la respuesta llegue al host.
Lo mismo aplica a `actionCards/act`, `userQuestions/answer`,
`commands/execute`, `session/prompt`, `session/cancel`, `session/fork`,
`session/rename`, la terminal, el gestor de plugins y los ajustes: todos son
mutaciones y quedan fuera del allowlist.

## Qué NO protege el rol (sé honesto)

- **No es una identidad de DeepSeek Harness.** El puente firma una sesión con
  el mismo secreto para todos los dispositivos y DeepSeek Harness cree hablar
  con el dueño. El rol es un filtro del puente: si un endpoint nuevo de
  DeepSeek Harness muta sin que su nombre lo delate y se colara en el
  allowlist, el viewer podría escribir. Por eso el allowlist es corto, se
  revisa con cada versión y todo lo desconocido se rechaza.
- **El WebSocket no se filtra por rol.** El viewer mantiene el canal en vivo
  (`/api/remote.mux`) para recibir eventos, que es de solo lectura en los
  flujos que usa la interfaz. Las llamadas unarias (escribir, aprobar) y las
  respuestas de aprobación van por HTTP y sí se bloquean, pero un flujo con
  uplink (hoy, adjuntar/retener una terminal ya existente) no se inspecciona.
  Es un riesgo residual conocido, no un permiso concedido.
- **Las lecturas por GET no se filtran.** Si el backend expusiera una acción
  por GET (no es el caso de la API de DeepSeek Harness, que usa POST para todo
  lo unario), el viewer podría invocarla. El rol limita métodos mutantes, no
  audita rutas GET.
- **El viewer puede leer conversaciones, imágenes adjuntas y datos de
  herramientas.** Es su propósito: es un lector, no un usuario sin acceso.
- **La interfaz puede degradarse.** Ajustes, cuenta, gestor de plugins,
  búsqueda entre sesiones y navegación de archivos del workspace son
  `owner-only` en DeepSeek Harness y ahora reciben 403. El viewer ve la
  conversación y las lecturas del allowlist; algunas pantallas pueden quedar
  incompletas.
- **La clave de acceso y `DSH_COMPANION_TOKEN` no son dispositivos.** Quien
  use esas credenciales entra como administrador: el rol se aplica solo a
  dispositivos emparejados por cookie.
- **No protege contra un teléfono comprometido que robe la cookie.** Si el
  atacante usa la cookie de un `full`, el rol no ayuda. Para cortar el acceso
  hay que revocar el dispositivo o usar el kill switch.

## Vigencia

La sesión dura **30 días** y se **renueva con el uso**: cada vez que abres la app
después de 24 horas, el contador vuelve a 30. Mientras la uses al menos una vez
al mes, no caduca nunca.

## Revocar desde consola

```bat
del "%USERPROFILE%\.dsh\companion-devices.json"
```

El registro se relee cuando el archivo cambia, así que surte efecto en la
petición siguiente, sin reiniciar el puente.

También se puede dejar un dispositivo en solo lectura editando el registro con
`"role": "viewer"`; el puente lo relee en la petición siguiente.

## La clave manual

Sigue existiendo, en `%USERPROFILE%\.dsh\companion-access-key`, para entrar desde
un navegador escribiéndola una vez. La app no la usa.

## Variables

| Variable | Por defecto | Efecto |
| --- | --- | --- |
| `DSH_PANEL_PORT` | `57421` | Puerto del panel local |
| `DSH_PANEL_TOKEN` | autogenerado | Boleto inicial de un solo uso del panel (se regenera al canjearse) |
| `DSH_DEVICE_TTL_DAYS` | `30` | Días de vigencia de la sesión |
| `DSH_DEVICE_REFRESH_HOURS` | `24` | Cada cuánto se renueva al usarla |
| `DSH_PENDING_TTL_MIN` | `15` | Minutos que una solicitud espera aprobación |
| `DSH_TARGET_PORT` | `52710` | Backend por defecto de los dispositivos sin `targetPort` |
| `DSH_ACCESS_DISABLE=1` | — | Sin aprobación ni clave. Solo se permite con el puente enlazado a `127.0.0.1` |

## Cómo verificarlo

```bat
node test/verify_device_profiles.mjs
```

Levanta un puente aislado con `DSH_HOME` temporal, un backend doble y otro
backend de prueba por puerto: comprueba la migración del registro, los 403 del
viewer, la escritura del full, el `targetPort` por dispositivo en HTTP y
WebSocket, el fallback con su log y las acciones nuevas del panel.

Para crear un `viewer` a mano, sin pasar por el panel:

```json
{ "role": "viewer", "targetPort": 52711 }
```

Y para volver a control total: `"role": "full"`.
