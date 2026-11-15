# DSH Mobile Companion 5.1.2 (versionCode 42) — versión estable de la serie 5

Esta es la **base congelada** de la serie 5. A partir de aquí, el proyecto avanza con mejoras
menores y publicaciones **pre-release** (5.2.x), sin tocar esta línea.

## Qué incluye la serie 5

### 5.0.0 — el cambio de modelo
Versión mayor porque deja de ser compatible con la 4.x:

- La identidad del dispositivo es la **cookie de sesión**, no la IP de origen.
- El **kill switch rota la clave de acceso**, además de revocar dispositivos.
- El panel no usa token maestro: **boleto de un solo uso** + cookie `HttpOnly`.
- `/dsh-companion/action` responde **501**: el puente no finge aprobar herramientas.
- Caducidad de 30 días aplicada **en el servidor**, con purga de dispositivos vencidos.
- `DSH_ACCESS_DISABLE=1` exige loopback para arrancar.

### 5.1.0 — cierre de los 56 hallazgos del informe
- **JS bridge blindado por nonce** (`BridgeGuard`): un iframe ya no puede gastar la clave de
  API ni lanzar una instalación.
- Verificación **SHA-256** del APK contra el digest de GitHub antes de instalar.
- Panel con validación de `Host`; descubrimiento validado contra el JSON del puente.
- Proxy con lista de métodos y **límite de subida**; `CleartextPolicy` fail-closed.
- `pendingList` solo para el panel; la VPN corporativa ya no se toma por defecto.
- Sync con Markdown fiel y retención configurable; telemetría perezosa (16 ms de arranque).
- Notificaciones honestas: sin botones que no hacen nada; la suite ya no borra el registro real.

### 5.1.1 — residuales
- Terminal remota **eliminada** (endpoint, `DSH_ENABLE_TERMINAL` y documentación).
- Modo satélite documentado en los 7 README y avisado en la propia página offline.
- CSP y cabeceras de seguridad en las páginas propias.

### 5.1.2 — corrección del panel
- El panel ya no se llena de solicitudes duplicadas del mismo teléfono: se reutiliza la del
  mismo equipo (IP + user-agent) y se agrupan los duplicados en una sola tarjeta.

## Verificación de este binario

| Parámetro | Valor |
| --- | --- |
| Archivo | `DSH-Companion.apk` |
| Versión | `versionCode 42` / `versionName 5.1.2` |
| Tamaño | 215 048 bytes (210 KB) |
| SHA-256 | `72f7bb9bb3084b4e4fb9b926b848ffb0ea27b3a26ff45764ce9960de45809c5d` |
| Firma | APK Signature Scheme v2 + v3 |
| Requisitos | Android 8.0 (SDK 26) o superior |

Se instala encima de cualquier 4.x o 5.0.x: la firma no cambia.

## Política de esta línea

- **5.1.2 queda congelada.** No recibe funciones nuevas; solo se tocaría por un fallo de
  seguridad crítico (y en ese caso saldría como 5.1.3).
- **Lo siguiente son pre-release**: 5.2.0-pre.1, etc., marcadas como *pre-release* en GitHub
  hasta que se estabilicen.
- La rama `stable/5` conserva exactamente este árbol.

## Cómo usarla

1. Descarga `DSH-Companion.apk` de este release e instálalo.
2. En la computadora, arranca el puente (`start.bat` o `run-hidden.vbs`).
3. En el teléfono, abre `http://<IP-PRIVADA>:57420` y aprueba el dispositivo desde `panel.bat`.
4. Para los avisos de la PC: Ajustes → *Notificaciones de la PC* y pulsa *Probar desde la PC*.
