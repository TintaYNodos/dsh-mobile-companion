# DSH Mobile Companion 5.2.0 (versionCode 51) — versión estable

Esta es la **versión estable** de la serie 5. Congela la línea: a partir de aquí solo se publican
**correcciones de seguridad**, no funciones nuevas. No hay cambios de configuración, formato de
datos ni API: la 5.1.10 se actualiza a la 5.2.0 encima, sin desinstalar (la firma no cambió desde la
5.1.7).

El trabajo de esta versión es de **fortalecimiento**: salud real, contrato con DeepSeek Harness,
copias de seguridad verificables y documentación de operación. Todas las funciones actuales siguen
igual.

## Qué cambia

### Salud real: `/healthz` y healthcheck de Docker

- `GET /healthz` distingue tres estados: `ok` (puente y Harness confirmados), `degraded` (ambos
  arriba pero alguna pieza del contrato cambió) y `down` (HTTP 503: Harness no responde). No exige
  credenciales y no expone secretos.
- El **healthcheck de Docker** pasa a usar `/healthz`: antes preguntaba a
  `/dsh-companion/status`, que responde 200 aunque Harness esté caído, así que un contenedor
  "sano" podía tener el teléfono incomunicado.

### Contrato con DeepSeek Harness

`src/dsh-contract.mjs` comprueba al arrancar (y cada 10 minutos) las piezas internas de Harness de
las que depende el puente: cookie `dsh-auth-*`, marcador `__DSH_BOOT__`, evento `turn/end`,
atributo `data-approval-key` y descubrimiento de puerto. Si una cambia, **degrada solo la función
afectada** con un aviso en `bridge.log`; el estado se expone como `contract` en
`/dsh-companion/status` y en `/healthz`.

### Copias de seguridad

- `backup.bat` / `restore.bat` (y `backup.ps1` / `restore.ps1`): copian el registro de dispositivos,
  la clave de acceso y el token del panel a `%USERPROFILE%\.dsh\backups\AAAA-MM-DD-HHMMSS\` con un
  manifiesto de tamaños y SHA-256. `-DryRun` no escribe nada.
- La restauración es **fail-closed**: verifica los hashes antes de escribir; si el respaldo está
  manipulado se niega sin tocar nada. Antes de restaurar guarda el estado actual.
- El instalador respalda el registro antes de actualizar, y `doctor.ps1` avisa si no hay una copia
  reciente.

### Operación y soporte

- `OPERACION.md` explica cómo aprobar un dispositivo nuevo, reiniciar el puente, revisar
  `bridge.log`, comprobar `/healthz` y restaurar copias sin estar delante de la computadora.
  Incluye la recomendación de **RustDesk** como soporte remoto opcional (servidor self-hosted o solo
  sobre ZeroTier/Tailscale, contraseña fuerte + 2FA, apagado cuando no se usa); **no es parte del
  producto ni se empaqueta**.
- `SUPPORT.md` fija la política: 5.2.0 estable y solo correcciones de seguridad; 5.1.x anterior.
- `CHECKLIST-ESTABLE.md`: comprobación de la versión estable **desde el teléfono**.
- `AUDITORIA-EXTERNA.md`: tres prompts listos para auditoría de seguridad, onboarding y APK.
- `RELEASES.json`: registro legible por máquina de cada build publicado (versión, `versionCode`,
  commit de origen, SHA-256, huella del certificado y fecha).

### Revisión de permisos del APK

Cada permiso se contrastó con su uso real. `RECORD_AUDIO` se mantiene porque solo se concede al
frame del búnker cuando la página pide captura de audio (quitarlo rompería la entrada de voz en la
GUI). `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` solo se pide al activar el interruptor "Permitir en
segundo plano" de los avisos, nunca al arrancar. Detalle en `SECURITY.md`.

### Limpieza

Notas `RELEASE_5.1.7/8/9` eliminadas (el `CHANGELOG` ya las cubre), las cuatro referencias de la
skill se fusionan en dos y se eliminan duplicados no referenciados.

## Verificación de este binario

| Parámetro | Valor |
| --- | --- |
| Archivo | `DSH-Companion.apk` |
| Versión | `versionCode 51` / `versionName 5.2.0` |
| Tamaño | `227336` bytes (222 KB) |
| SHA-256 | `cbf157126b565054e4931f1820562887030d6867ca7c34c866cb9995fc4906fd` |
| Firma | APK Signature Scheme v2 + v3, certificado de release RSA 4096 |
| Huella del certificado (SHA-256) | `4F:E1:AD:C0:45:71:AF:2B:89:1B:E4:6B:1B:3C:86:39:65:F6:73:A6:B7:25:87:61:47:96:91:7F:49:63:65:23` |
| Requisitos | Android 8.0 (SDK 26) o superior |

Comprobado antes de publicar:

- **14 suites / 235 comprobaciones** en local (puente aislado enlazado a la red privada) y **203**
  en CI, todas correctas.
- Tests Java puros: **61** watchdog + **16** cleartext + **14** bridgeguard + **25** apkdigest,
  0 fallos; `javac` limpio.
- Verificaciones adicionales de 5.2.0: **22/22** de salud y contrato (`test/verify_healthz.mjs`) y
  **10/10** de respaldo/restauración (`test/verify_backup.mjs`), con una restauración real sobre un
  `DSH_HOME` aislado.
- `node tools/audit-repo.mjs`: **sin hallazgos**; `doctor.ps1 -Json -Report` con recibo válido
  (`tools/verify-receipt.mjs`).

## Antes de instalar

**Actualiza el APK y el puente juntos.** Un APK 5.2.0 con un puente 5.1.10 funciona para lo de
siempre, pero no tendrá `/healthz` ni el contrato; un puente 5.2.0 con un APK 5.1.10 funciona igual
que antes. Lo recomendable es actualizar los dos a la vez.

La firma de release es la definitiva **desde la 5.1.7**. Si vienes de una versión anterior a esa,
desinstala una vez; desde la 5.1.7 se instala encima sin problema.

## Política de esta línea

- **La 5.2.0 es la versión estable.** Solo un fallo de seguridad crítico produciría una 5.2.1.
- La rama `stable/5` conserva exactamente este árbol.
- El compromiso de mantenimiento a largo plazo se mantiene en un documento interno, fuera de este
  repositorio; aquí no se promete nada más allá de "estable, solo correcciones de seguridad".

## Cómo usarla

1. Descarga `DSH-Companion.apk` de este release e instálalo encima de la 5.1.10.
2. En la computadora: actualiza el árbol y reinicia el puente (`stop.bat` + `start.bat` o
   `install-autostart.bat`).
3. Comprueba la salud: `http://<IP-PRIVADA>:57420/healthz` debe responder `"status": "ok"`.
4. Haz una copia preventiva con `backup.bat` y revisa la guía de `OPERACION.md`.
