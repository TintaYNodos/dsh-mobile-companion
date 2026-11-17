# Lista de verificación de la versión estable (desde el teléfono)

Esta lista sirve para comprobar la versión **estable** de DSH Mobile Companion **sin usar la
computadora**. Todo lo que aparece aquí se ve desde el teléfono en la red privada (ZeroTier,
Tailscale u otra). No hace falta abrir el panel de la computadora ni tocar archivos.

> Versión que compruebas: **5.2.9** (versionCode **53**).
> Si el teléfono muestra otra versión, para: no estás probando la build publicada.

## Antes de empezar (una sola vez)

1. Abre la app del túnel privado en el teléfono y confirma que está conectada.
2. En el navegador del teléfono, entra a `http://<IP-PRIVADA>:57420/dsh-companion/status`.
   Debe responder un texto JSON con `"version": "5.2.9"` y `"apkVersionCode": 53`.
   La IP privada es la que te dio el túnel; no la inventes.
3. Guarda esa URL en favoritos: es tu comprobación rápida si algo falla.

## Comprobaciones de la app

Marca cada línea. Si una falla, anota el número del paso y lo que viste.

- [ ] **1. La app abre** con la interfaz de DeepSeek Harness y no se queda en la pantalla de
      espera de aprobación.
- [ ] **2. Emparejamiento recordado**: cierras y vuelves a abrir la app y sigues dentro, sin
      pedir aprobación otra vez.
- [ ] **3. Mensaje de ida y vuelta**: escribes algo corto, lo envías y llega la respuesta. Si el
      agente pide una aprobación, el aviso aparece en el teléfono y puedes verlo.
- [ ] **4. Barra de teclas**: el botón de teclado muestra `Tab`, `Esc`, `{ }`, `[ ]`, `( )`, `|`,
      `~` y la tecla de acento; insertar `{` deja el cursor dentro.
- [ ] **5. Aviso de la PC**: en Ajustes -> *Notificaciones de la PC*, pulsa *Probar desde la PC*.
      En pocos segundos llega un aviso. Si no llega, revisa que el interruptor esté activo.
- [ ] **6. Notas (con la PC apagada)**: abre *Notas* y crea una nota en el perfil General con
      título y cuerpo. Se guarda sola («Guardado»); al reabrir la app la nota sigue ahí, sin pedir
      Internet, cuenta ni clave de API.
- [ ] **7. Fecha límite, orden y filtros**: crea una nota con fecha límite (selector de fecha),
      ordena la lista por vencimiento y activa el filtro «Con fecha»: solo quedan las que tienen
      fecha, de la más próxima a la más lejana. Prueba también el filtro «Prioridad».
- [ ] **8. Búsqueda sin acentos ni mayúsculas**: crea una nota con «García» en el título y busca
      `garcia`: la nota aparece.
- [ ] **9. «Solo en el teléfono»**: marca una nota con esa etiqueta; «Enviar todas» no la incluye,
      no se envía a la PC y al compartirla la app pide confirmación.
- [ ] **10. FLAG_SECURE en Notas**: con Notas abierta, intenta una captura de pantalla: el sistema
      la bloquea o sale en negro, y en el selector de recientes no se lee el contenido.
- [ ] **11. Enviar a la PC (solo título e idempotencia)**: con la PC encendida y el puente
      accesible, crea una nota **solo con título**, pulsa *Enviar a la PC* y envíala dos veces. La
      segunda no debe crear un archivo nuevo: actualiza el mismo. Si la PC está apagada, la nota se
      queda en el teléfono.
- [ ] **12. Ajustes del teléfono**: en Ajustes aparece la versión **5.2.9**, el estado de la
      conexión y el botón de comprobar actualización sin errores.
- [ ] **13. Sin batería de sobra**: si activaste los avisos, Android te pidió la exención de
      batería una sola vez (no en cada arranque).
- [ ] **14. No se cae**: durante unos minutos de uso normal, la app no se cierra ni muestra la
      pantalla de "reconectando" de forma continua.

## Pruebas de Notas por persona

Con la app ya emparejada, prueba el perfil de tu área. En cada caso: crea la nota con los campos
propios del perfil, ponle una fecha límite, cámbiala de estado, envíala a la PC y reenvíala para
comprobar que no se duplica.

| Perfil | Qué probar | Campos propios |
| --- | --- | --- |
| **Docente** | Una nota de clase con su estado (Borrador → Listo → Aplicado) y una observación de un alumno. | Materia · Grupo o alumno |
| **Periodista** | Una nota de caso con su fuente, de En curso a Publicado, y una corrección. | Caso o tema · Fuente |
| **Jurídico (abogado)** | Una nota de expediente con cliente y una nota de plazo con fecha límite. | Expediente · Cliente |
| **Diseño (diseñador)** | Una nota de encargo con cliente, de Idea a Aprobado, y una de comentario. | Cliente · Proyecto |
| **Accesibilidad (TalkBack)** | Recorre la lista y el editor con TalkBack: los chips anuncian la opción seleccionada, el autoguardado se anuncia en una región viva y el título de la tarjeta se lee completo (2 líneas). Comprueba objetivos táctiles cómodos (≥48 dp) y contraste AA en las insignias. | — |

## Comprobaciones de la computadora (sin estar delante de ella)

Se hacen desde el teléfono, abriendo URLs de la red privada:

- [ ] **15. Salud del puente**: abre `http://<IP-PRIVADA>:57420/healthz`. Debe responder
      `"status": "ok"` y mostrar el estado del puente y de DeepSeek Harness. Si responde 503 o
      `"status": "down"`, la computadora o Harness están apagados.
- [ ] **16. Contrato**: en la misma respuesta de `/healthz` (o en `/status` desde la app), el
      apartado `contract` debe indicar qué piezas de Harness se comprobaron. Si alguna aparece
      `degraded`, la función asociada (avisos, aprobaciones) puede no responder: apúntalo.
- [ ] **17. Descarga del APK**: en `http://<IP-PRIVADA>:57420/` -> *Actualizar*, la app debe
      encontrar la versión 5.2.9 y su huella SHA-256. No instales nada que no venga de ahí o de
      GitHub con la huella correcta.

## Lo que solo puede revisar quien tenga la computadora

Estas seis no se pueden comprobar desde el teléfono. Pídelas cuando estés delante del equipo:

- La copia de seguridad del registro, la clave y el token del panel (`backup.bat`).
- El diagnóstico oficial (`doctor.ps1 -Json -Report`) sin fallos.
- El APK instalado procede del certificado de release (huella del certificado en
  `SECURITY.md`).
- **La nota enviada desde el teléfono**: con la PC encendida, tras usar *Enviar a la PC*, el
  archivo `.md` de la nota aparece en `synced_chats/notes/` dentro de la carpeta del puente, con
  front matter que incluye `id`, `dueDate` y `updatedAt`, y sin `chatTarget`.
- **La bandeja «Notas recibidas» del panel** (`127.0.0.1:57421`): muestra las últimas 10 notas en
  solo lectura; reenviar una nota actualiza su fila en vez de duplicarla, y
  `GET /dsh-companion/notes` devuelve la misma lista de metadatos sin los cuerpos.
- **El archivo de notas del teléfono** (`notes.json`, en el directorio privado de la app): no se
  puede abrir como JSON plano porque está cifrado (cabecera `DSHNOTES` y AES-256-GCM).

## Si algo falla

1. No desinstales la app ni borres datos: primero anota el paso que falló.
2. Abre `http://<IP-PRIVADA>:57420/healthz` y copia el resultado.
3. Pide el informe con la versión (`5.2.9`), el paso y el texto exacto del error.
4. La guía de soporte remoto está en `OPERACION.md` (en el repositorio y el release).
