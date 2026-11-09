# DSH Mobile Companion
> Acceso móvil remoto y seguro para la interfaz web de DeepSeek Harness mediante ZeroTier o Tailscale, con auto-arranque y soporte completo de WebSockets.
> 
> Edición Endurecida elaborada por Ismael Muñoz Reyes para Tinta y Nodos.

---

## Características Principales

- **Interfaz móvil en pantalla completa (PWA o APK):** Permite usar la interfaz web integrada en DeepSeek Harness directamente desde el teléfono o tableta.
- **Seguro y Privado:** No abre puertos públicos en el módem ni router. Escucha estrictamente en la IP privada de la VPN (ZeroTier o Tailscale) para evitar cualquier exposición en redes locales compartidas.
- **Cero pérdida de caché (Prompt Caching intacto):** DeepSeek Harness mantiene el prefijo inmutable en el servidor local, ahorrando más del 90% en consumo de tokens en modelos con ventana larga como Gemini o DeepSeek.
- **Auto-inicio con Windows:** Corre en segundo plano sin consolas visibles. Si la computadora se apaga o reinicia, el servicio se levanta automáticamente.
- **Cero Dependencias Externas:** Programado en Node.js puro (`http`, `net`, `crypto`, `fs`). No requiere `npm install` ni paquetes de terceros, reduciendo a cero el riesgo de librerías comprometidas en la cadena de suministro.

---

## Instalación Rápida

### 1. Requisitos
- Windows 10 u 11 con DeepSeek Harness instalado (el servicio detecta y utiliza de forma transparente el binario de Node.js integrado en DSH sin obligar a instalar Node en Windows).
- ZeroTier o Tailscale conectado tanto en la PC como en el dispositivo móvil.

### 2. Pasos en la Computadora:
1. Clonar o descargar este repositorio:
   ```bash
   git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
   ```
2. Entrar a la carpeta y ejecutar `install-autostart.bat`.
3. El script detectará la IP de la VPN y se registrará para arrancar automáticamente con Windows.

### 3. Pasos en el Dispositivo Móvil (2 Opciones):

#### Opción A: Mediante la App APK Oficial
1. Ir a la sección de Releases de este repositorio en GitHub y descargar `DSH-Companion.apk`.
2. Instalarla en el dispositivo Android.
3. Asegurar la conexión activa a la VPN y abrir la aplicación.

#### Opción B: Mediante Navegador Web (Android / iOS / iPad)
1. Con la VPN encendida, abrir Chrome o Safari y entrar a:
   ```text
   http://<TU_IP_VPN>:57420
   ```
   *(Ejemplo: `http://10.x.x.x:57420` en ZeroTier o `http://100.x.x.x:57420` en Tailscale)*
2. En el menú del navegador, seleccionar "Agregar a la pantalla principal" o "Instalar aplicación".
3. Se abrirá como aplicación web en pantalla completa.

---

## Explicación Técnica de Seguridad

Por diseño de seguridad, DeepSeek Harness bloquea cualquier conexión que no provenga de `127.0.0.1` (`dsh web --host 0.0.0.0` no está soportado). Además, exige una cookie firmada con HMAC-SHA256 (`dsh-auth-*`) vinculada al secreto de sesión local (`$DSH_HOME/.credentials.yaml`).

Cualquier dispositivo que intente conectarse desde la red local o VPN recibe un error `401 / 403 Unauthorized`.

### Funcionamiento del Puente:
1. Escucha de forma exclusiva en la interfaz privada de la VPN (`10.x.x.x` o `100.x.x.x`), blindando la red contra accesos desde Wi-Fi compartidas o redes locales no confiables.
2. Reescribe el encabezado `Host` hacia `127.0.0.1:52710` (o el puerto dinámico activo de DSH).
3. Inyecta la cookie de autenticación HMAC generada con el secreto de la máquina local.
4. Redirige tanto peticiones HTTP como el handshake de WebSockets (`ws://`) de forma bidireccional, transparente y sanitizada contra inyecciones CRLF.

---

## Estructura del Proyecto

```text
dsh-mobile-companion/
├── bridge.mjs             # Servidor proxy inverso seguro en Node.js puro
├── run-hidden.vbs         # Lanzador silencioso en segundo plano con registro de log
├── install-autostart.bat  # Configura el inicio automático en Windows
├── uninstall-autostart.bat# Desinstala el servicio y limpia accesos directos
├── start.bat              # Inicio manual del servicio
├── stop.bat               # Detención segura del proceso local
├── LICENSE                # Licencia de código abierto MIT
└── README.md              # Documentación oficial del proyecto
```

---

## Licencia y Créditos
- Autoría de Edición Endurecida: Ismael Muñoz Reyes
- Proyecto: Tinta y Nodos
- Licencia: MIT License - Código libre para la comunidad de desarrolladores de DeepSeek Harness.
