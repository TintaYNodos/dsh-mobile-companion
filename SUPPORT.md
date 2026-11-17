# Política de soporte

**Versión estable actual: 5.2.10** (puente y APK, versionCode 54). La línea estable recibe
correcciones de seguridad y versiones de mantenimiento de la serie 5.2. **5.2.9 queda como la
versión anterior** y ya no recibe cambios: si sigues en ella, actualiza a 5.2.10.

## Estado de las versiones

| Versión | Estado | Qué recibe |
| --- | --- | --- |
| 5.2.10 (estable, versionCode 54) | **Soportada** | Correcciones de seguridad de la serie 5.2 |
| 5.2.9 y anteriores de la serie 5.2 | Sin soporte | Nada; actualiza a la 5.2.10 |
| 5.1.x y anteriores | Sin soporte | Nada; actualiza a la 5.2.10 |

La versión se comprueba en la app (Ajustes) o en `/dsh-companion/status` (`version` y
`apkVersionCode`). La huella del certificado de release y cómo verificar un APK están en
[SECURITY.md](SECURITY.md).

## Qué cubre el soporte

Soporte **comunitario y de mejor esfuerzo**: no hay SLA ni garantía de respuesta, y no se promete
soporte de herramientas de terceros. Lo que se intenta resolver:

- Instalación y puesta en marcha en Windows: `doctor.ps1`, `install-autostart.bat`, `start.bat`.
- Emparejamiento del teléfono y panel de aprobación: `panel.bat`, roles, revocación.
- Conexión del teléfono por la red privada y detección de la interfaz (ZeroTier, Tailscale, NetBird
  y las demás de [VPN_OPTIONS.md](VPN_OPTIONS.md)).
- Notificaciones de fin de turno, prueba desde la PC y canales de notificación.
- Notas locales: perfiles por área, fecha límite, cifrado local, marca «Solo en el teléfono»,
  envío a la PC (idempotente por `id`) y bandeja «Notas recibidas» del panel.
- Salud del puente y contrato de DeepSeek Harness (`/healthz`).
- Copias de seguridad del registro, la clave de acceso y el token del panel ([backup.bat](backup.bat),
  [restore.bat](restore.bat)).
- Actualización del APK y comprobación de firma y huella.
- Errores reproducibles del puente (`bridge.mjs`, `src/**`) y de la app Android de este repositorio.

El procedimiento completo de operación está en [OPERACION.md](OPERACION.md) y la comprobación
guiada desde el teléfono en [CHECKLIST-ESTABLE.md](CHECKLIST-ESTABLE.md).

## Qué no cubre

- **La red privada en sí**: configuración, rutas, autorización de nodos y firewall de
  ZeroTier/Tailscale dependen de su proveedor. Se orienta y se enlazan opciones, pero no se
  administra la red de otra persona.
- **DeepSeek Harness** y sus credenciales: es el backend; su instalación y su cuenta se soportan en
  el proyecto de Harness.
- **El teléfono**: modelo, ROM, proveedor, ahorro de batería y permisos del sistema no se pueden
  depurar desde aquí.
- **Los extras opcionales**: la skill de instalación y **RustDesk** (herramienta de terceros,
  recomendación opcional que nunca se empaqueta ni forma parte del producto) no están cubiertos
  como funciones del proyecto.
- **Exposición a Internet del puente**: es una configuración no soportada por diseño. No se ayuda a
  publicar el puente ni el panel fuera de la red privada.
- **Recuperar secretos perdidos**: la clave de acceso y el token del panel no se pueden reconstruir.
  Si se pierden, se rotan (interruptor de seguridad) y se vuelve a emparejar.
- **Forks, código modificado o versiones no publicadas** en GitHub Releases.

## Cómo pedir ayuda con evidencia

Un informe sin evidencia se responde con otra pregunta. Antes de abrir un issue, reúne:

1. **Versión exacta**: la que muestra la app en Ajustes, o `version` y `apkVersionCode` de
   `/dsh-companion/status`.
2. **Salud del puente**: la salida de `/healthz` (`http://<IP-PRIVADA>:57420/healthz`), copiada
   tal cual y **redactada**.
3. **Diagnóstico verificado**: en la computadora,
   `powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report` y después
   `node tools/verify-receipt.mjs doctor-report.json`. Adjunta `doctor-report.json` e indica si el
   recibo salió válido; sin recibo válido el informe se considera no fiable.
4. **Líneas relevantes de `bridge.log`** (las que muestran el error), no el archivo entero.
5. **Pasos para reproducir**, resultado esperado y resultado observado, y desde cuándo ocurre.

Redacta siempre antes de pegar: sustituye la IP privada por `<IP-PRIVADA>` y los nombres de
dispositivos por un alias. **Nunca** pegues la clave de acceso, el token del panel, cookies,
`.credentials.yaml` ni la `HAR` de Harness. El puente nunca escribe la clave completa en el log
(solo sus 4 últimos caracteres), pero el log sí contiene IP privadas y rutas del perfil.

Dónde preguntar:

- Errores y dudas: [GitHub Issues](https://github.com/TintaYNodos/dsh-mobile-companion/issues)
  (la plantilla está en `.github/ISSUE_TEMPLATE/bug_report.md`).
- **Vulnerabilidades de seguridad: nunca en un issue público.** Sigue
  [SECURITY.md](SECURITY.md) (aviso privado de GitHub o correo de seguridad).
- Cómo contribuir con un cambio: [CONTRIBUTING.md](CONTRIBUTING.md).

## Sin garantías

Este es un proyecto comunitario. El soporte se presta cuando hay tiempo y no constituye un
compromiso contractual: no hay plazos de respuesta, ni obligación de corregir, ni soporte de
terceros. Los plazos que figuran en [SECURITY.md](SECURITY.md) aplican **solo a vulnerabilidades de
seguridad**, no al soporte general.

## Enlaces

- [OPERACION.md](OPERACION.md): operación y soporte remoto paso a paso.
- [CHECKLIST-ESTABLE.md](CHECKLIST-ESTABLE.md): comprobación completa desde el teléfono.
- [SECURITY.md](SECURITY.md): reportar vulnerabilidades y verificar builds.
- [AI_SETUP_PROMPT.md](AI_SETUP_PROMPT.md): instalación guiada por un agente de IA.
- [VPN_OPTIONS.md](VPN_OPTIONS.md): redes privadas compatibles.
- [CONTRIBUTING.md](CONTRIBUTING.md): cómo contribuir.
