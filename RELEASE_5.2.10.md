# DSH Mobile Companion 5.2.10 (`versionCode` 54) — Correcciones de la auditoría

Versión de **solo correcciones** de la serie 5.2. No añade funciones. Cierra los hallazgos de la
auditoría técnica sobre la 5.2.9: integridad de las notas ante cortes, acceso y kill switch,
emparejamiento, QR, modo apaisado y operación en Windows.

## Qué se corrige

### Notas: los datos no se pierden ni se duplican

- La nota se escribe en un temporal y se renombra: un corte de corriente o un `SIGKILL` ya no deja
  un `.md` de 0 bytes.
- El nombre se reserva en `ids.json` **antes** del contenido. Si el proceso muere entre ambos pasos,
  reenviar la misma nota actualiza en vez de crear un duplicado.
- La poda de `inbox.jsonl` entra en la misma cola que las escrituras: se acaban los `EPERM` y los
  `.tmp` huérfanos que aparecían con envíos concurrentes en Windows.
- `GET /dsh-companion/notes` devuelve las 500 notas que retiene la poda (antes se quedaba en 200).

### Acceso

- **Kill switch**: si la clave la fija `DSH_ACCESS_KEY`, la respuesta es `rotated: false` con el
  motivo, en vez de anunciar una rotación que no ocurrió. Con clave en archivo, rota de verdad.
- La comprobación de clave deja de aceptar un `Authorization` cualquiera cuando no hay clave.
- Un rechazo afecta solo a la solicitud rechazada, no a todos los equipos detrás de la misma IP.
- `/healthz` pasa por la misma frontera de `Host`/`Origin` que el resto del puente.

### QR y emparejamiento

- Si la URL no cabe en el QR, se muestra en texto; nunca se genera un QR truncado (dos URL
  distintas ya no producen el mismo código).
- En el teléfono, el lector de QR vuelve a resolverse en Android 11+ (`<queries>` en el manifest).

### Teléfono

- Un solo envío en vuelo: doble toque en «Enviar» ya no duplica la nota en la PC.
- `5.2.9-rc1` ya no se considera más nuevo que `5.2.9`.
- «Limpiar caché» conserva la cookie de emparejamiento: no hay que volver a aprobar el teléfono.
- Notas conserva filtros, orden y búsqueda al girar; modo apaisado con drawer y compositor compacto.
- Avisos: el interruptor maestro cubre la desconexión, la visibilidad es coherente y el permiso de
  batería se re-sincroniza al volver del diálogo.

### Operación

- Cierre ordenado en Windows por bandera (`companion.stop`): `stop.bat` espera hasta 5 s y solo
  fuerza si el puente no cerró.
- Las variables de entorno inválidas avisan con el valor rechazado y el default aplicado.
- La suite queda aislada del `synced_chats/` y del `bridge.log` del repositorio.

## Qué no cambia

- Las funciones de la 5.2.9: perfiles, fecha límite, privacidad local, «Solo en el teléfono»,
  bandeja del panel, accesibilidad y lector offline.
- La política de la línea: correcciones de seguridad y mantenimiento, sin promesas de fechas.

## Cómo se instala

1. Instala el APK **5.2.10** (`versionCode` 54) **encima de la 5.2.9** (`versionCode` 53): no hace
   falta desinstalar ni volver a emparejar; la firma no cambia desde la 5.1.7.
2. Actualiza el puente y reinícialo (`stop.bat` + `start.bat`, o deja que el autoarranque lo
   levante). Puente y APK deben hablar el mismo contrato.
3. Comprueba la versión en Ajustes y en `http://<IP-PRIVADA>:57420/dsh-companion/status`
   (`version`, `apkVersionCode`).
4. En Notas, prueba lo que cambió: envía una nota dos veces (no debe duplicarse), marca una
   «Solo en el teléfono», y en el Hub usa «Limpiar caché» y comprueba que sigues dentro sin
   re-aprobar.

## Verificación

- **17 suites, 418 comprobaciones** en local; **344 en CI** (`run-suite`, 12 suites + 3 omitidas con
  motivo); **628** comprobaciones Java (61 watchdog + 14 bridgeguard + 16 cleartext + 25 apkdigest +
  481 notas + 26 versiones + 5 guard de envío).
- Caos: 20 rondas de `SIGKILL` a mitad de escritura y reenvío del mismo `id` → 0 archivos de 0 bytes
  y 0 duplicados; 6 rondas de poda concurrente → 0 `.tmp` y 0 `EPERM`; 100 POST concurrentes.
- `node tools/audit-repo.mjs`: sin hallazgos.
- `doctor.ps1 -Json -Report` con recibo verificado por `tools/verify-receipt.mjs`.
- Suite aislada: `synced_chats/` y `bridge.log` del repositorio sin cambios (comprobado por huella).

## APK

| Dato | Valor |
| --- | --- |
| Versión | `versionCode 54` / `versionName 5.2.10` |
| Tamaño | 268 296 bytes (262 KB) |
| SHA-256 | `c476f212131de48e90855d7ada97ec543cb72d70523304ae86dae5d215a17eee` |
| Firma | v2+v3, certificado de release RSA 4096 (sin cambios desde 5.1.7: se instala encima de 5.2.9) |
