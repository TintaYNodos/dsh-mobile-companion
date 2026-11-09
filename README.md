# DSH Mobile Companion 📱⚡
> **Accede a DeepSeek Harness desde tu celular o tablet de forma segura mediante ZeroTier o Tailscale, con auto-inicio y soporte completo de WebSockets.**
> 
> *Secure remote mobile access for DeepSeek Harness Web GUI via ZeroTier or Tailscale with zero prompt-cache invalidation.*

---

## 🌟 Características / Features

- 📱 **Interfaz móvil nativa (PWA):** Aprovecha la interfaz web moderna y responsiva incluida en DeepSeek Harness.
- 🔒 **100% Seguro y Privado:** No abre puertos públicos en tu router. Funciona exclusivamente a través de tu red VPN privada (ZeroTier / Tailscale).
- 🧠 **Cero pérdida de caché (Prompt Caching):** A diferencia de otros frontends que reescriben el contexto continuamente, Harness mantiene el prefijo intacto, ahorrándote más del 90% en consumo de tokens en modelos con ventana larga como Gemini o DeepSeek.
- ⚡ **Auto-inicio con Windows:** Corre silenciosamente en segundo plano sin ventanas molestas de consola. Si apagas o reinicias tu PC, el puente se levanta automáticamente.
- 🛠️ **Cero Dependencias Externas:** Escrito en Node.js puro (`http`, `net`, `crypto`, `fs`). No requiere `npm install` ni paquetes pesados.

---

## 🚀 Instalación Rápida (1 Clic) / Quick Setup

### 1. Requisitos
- Windows 10/11 con **DeepSeek Harness** instalado (utiliza automáticamente el runtime de Node.js empaquetado en DSH o el de tu sistema).
- **ZeroTier** o **Tailscale** conectado en tu PC y en tu celular o tablet.

### 2. Pasos en la PC:
1. Clona o descarga este repositorio:
   ```bash
   git clone https://github.com/TU_USUARIO/dsh-mobile-companion.git
   ```
2. Haz doble clic en **`install-autostart.bat`**.
3. ¡Listo! El script detectará tu IP privada de ZeroTier/Tailscale y se configurará para arrancar con Windows.

### 3. Pasos en tu Celular:
1. Asegúrate de tener **ZeroTier** o **Tailscale** encendido.
2. Abre **Chrome** (Android) o **Safari** (iOS) y ve a:
   ```text
   http://<TU_IP_VPN>:57420
   ```
   *(Ejemplo: `http://10.x.x.x:57420` en ZeroTier o `http://100.x.x.x:57420` en Tailscale)*
3. Toca el menú del navegador y selecciona **"Agregar a la pantalla principal"** / **"Instalar aplicación"**.
4. ¡Se abrirá como una app nativa en pantalla completa!

---

## 🔍 ¿Por qué era necesario este puente? (Explicación Técnica)

Por diseño de seguridad, DeepSeek Harness bloquea cualquier conexión que no provenga de `127.0.0.1` (`dsh web --host 0.0.0.0 is unsupported`). Además, requiere una cookie firmada con HMAC-SHA256 (`dsh-auth-*`) vinculada al secreto de sesión local (`$DSH_HOME/.credentials.yaml`).

Cualquier dispositivo que intente conectarse desde la red local o VPN recibe un error `401 / 403 Unauthorized`.

### Cómo lo resuelve este puente:
1. Escucha en tu interfaz privada de VPN (`10.x.x.x` o `100.x.x.x`).
2. Reescribe el encabezado `Host` a `127.0.0.1:57420`.
3. Inyecta al vuelo la cookie de autenticación HMAC generada con el secreto de tu máquina.
4. Redirige tanto peticiones HTTP como el handshake de WebSockets (`ws://`) de forma bidireccional y transparente.

---

## 📂 Estructura de Archivos

```text
dsh-mobile-companion/
├── bridge.mjs             # Servidor proxy inverso dinámico en Node.js
├── run-hidden.vbs         # Lanzador silencioso en segundo plano
├── install-autostart.bat  # Crea el acceso directo en Startup de Windows
├── uninstall-autostart.bat# Desinstala el servicio
├── start.bat              # Inicio manual
├── stop.bat               # Detener servicio
└── README.md              # Documentación
```

---

## 📄 Licencia
MIT License - Libre para la comunidad de código abierto.
