# Lista de verificación de la versión estable (desde el teléfono)

Esta lista sirve para comprobar la versión **estable** de DSH Mobile Companion **sin usar la
computadora**. Todo lo que aparece aquí se ve desde el teléfono en la red privada (ZeroTier,
Tailscale u otra). No hace falta abrir el panel de la computadora ni tocar archivos.

> Versión que compruebas: **5.2.0** (versionCode **51**).
> Si el teléfono muestra otra versión, para: no estás probando la build que se congeló.

## Antes de empezar (una sola vez)

1. Abre la app del túnel privado en el teléfono y confirma que está conectada.
2. En el navegador del teléfono, entra a `http://<IP-PRIVADA>:57420/dsh-companion/status`.
   Debe responder un texto JSON con `"version": "5.2.0"` y `"apkVersionCode": 51`.
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
- [ ] **6. Modo sin conexión**: abre la pestaña *Sin conexión* / *Satélite*, escribe una nota y
      guárdala; al volver a abrirla sigue ahí.
- [ ] **7. Ajustes del teléfono**: en Ajustes aparece la versión **5.2.0**, el estado de la
      conexión y el botón de comprobar actualización sin errores.
- [ ] **8. Sin batería de sobra**: si activaste los avisos, Android te pidió la exención de
      batería una sola vez (no en cada arranque).
- [ ] **9. No se cae**: durante unos minutos de uso normal, la app no se cierra ni muestra la
      pantalla de "reconectando" de forma continua.

## Comprobaciones de la computadora (sin estar delante de ella)

Se hacen desde el teléfono, abriendo URLs de la red privada:

- [ ] **10. Salud del puente**: abre `http://<IP-PRIVADA>:57420/healthz`. Debe responder
      `"status": "ok"` y mostrar el estado del puente y de DeepSeek Harness. Si responde 503 o
      `"status": "down"`, la computadora o Harness están apagados.
- [ ] **11. Contrato**: en la misma respuesta de `/healthz` (o en `/status` desde la app), el
      apartado `contract` debe indicar qué piezas de Harness se comprobaron. Si alguna aparece
      `degraded`, la función asociada (avisos, aprobaciones) puede no responder: apúntalo.
- [ ] **12. Descarga del APK**: en `http://<IP-PRIVADA>:57420/` -> *Actualizar*, la app debe
      encontrar la versión 5.2.0 y su huella SHA-256. No instales nada que no venga de ahí o de
      GitHub con la huella correcta.

## Lo que solo puede revisar quien tenga la computadora

Estas tres no se pueden comprobar desde el teléfono. Pídelas cuando estés delante del equipo:

- La copia de seguridad del registro, la clave y el token del panel (`backup.bat`).
- El diagnóstico oficial (`doctor.ps1 -Json -Report`) sin fallos.
- El APK instalado procede del certificado de release (huella del certificado en
  `SECURITY.md`).

## Si algo falla

1. No desinstales la app ni borres datos: primero anota el paso que falló.
2. Abre `http://<IP-PRIVADA>:57420/healthz` y copia el resultado.
3. Pide el informe con la versión (`5.2.0`), el paso y el texto exacto del error.
4. La guía de soporte remoto está en `OPERACION.md` (en el repositorio y el release).
