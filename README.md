# DSH Mobile Companion 📱⚡
> **Acceso móvil remoto y seguro para la interfaz web de DeepSeek Harness mediante ZeroTier o Tailscale, con auto-arranque y soporte completo de WebSockets.**
> 
> *Edición Endurecida elaborada por Ismael Muñoz Reyes para Tinta y Nodos.*

---

## 🌟 Características Principales

- 📱 **Interfaz móvil en pantalla completa (PWA o APK):** Aprovecha la interfaz web moderna y responsiva integrada en DeepSeek Harness directamente desde tu teléfono o tableta.
- 🔒 **100% Seguro y Privado:** No abre puertos públicos en tu módem ni router. Escucha estrictamente en la IP privada de tu VPN (ZeroTier o Tailscale) para evitar cualquier exposición en redes locales compartidas.
- 🧠 **Cero pérdida de caché (Prompt Caching intacto):** A diferencia de otros clientes que reescriben el contexto continuamente, DeepSeek Harness mantiene el prefijo inmutable, ahorrando más del 90% en consumo de tokens en modelos con ventana larga como Gemini o DeepSeek.
- ⚡ **Auto-inicio con Windows:** Corre silenciosamente en segundo plano sin consolas visibles. Si apagas o reinicias la computadora, el puente se levanta automáticamente.
- 🛠️ **Cero Dependencias Externas:** Programado en Node.js puro (`http`, `net`, `crypto`, `fs`). No requiere `npm install` ni paquetes de terceros, reduciendo a cero el riesgo de librerías comprometidas.

---

## 🚀 Instalación Rápida (1 Clic)

### 1. Requisitos
- Windows 10 u 11 con **DeepSeek Harness** instalado (el puente detecta y utiliza de forma transparente el Node.js integrado de DSH sin obligarte a instalar Node en Windows).
- **ZeroTier** o **Tailscale** conectado tanto en tu PC como en tu celular.

### 2. Pasos en la Computadora:
1. Clona o descarga este repositorio:
   ```bash
   git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
   ```
2. Entra a la carpeta y haz doble clic en **`install-autostart.bat`**.
3. ¡Listo! El script detectará la IP de tu VPN y se registrará para arrancar automáticamente con Windows.

### 3. Pasos en tu Celular (2 Opciones):

#### Opción A: Mediante la App APK Oficial
1. Ve a la sección de **Releases** de este repositorio en GitHub y descarga `DSH-Companion.apk`.
2. Instálala en tu dispositivo Android.
3. Asegúrate de tener activa tu VPN y navega con tu app dedicada.

#### Opción B: Mediante el Navegador Web (Android / iOS / iPad)
1. Con tu VPN encendida, abre **Chrome** o **Safari** y entra a:
   ```text
   http://<TU_IP_VPN>:57420
   ```
   *(Ejemplo: `http://10.x.x.x:57420` en ZeroTier o `http://100.x.x.x:57420` en Tailscale)*
2. Toca el menú del navegador y selecciona **"Agregar a la pantalla principal"** o **"Instalar aplicación"**.
3. ¡Se abrirá como una aplicación nativa en pantalla completa!

---

## 🔍 ¿Por qué era necesario este puente? (Explicación Técnica)

Por diseño de seguridad, DeepSeek Harness bloquea cualquier conexión que no provenga de `127.0.0.1` (`dsh web --host 0.0.0.0 no está soportado`). Además, exige una cookie firmada con HMAC-SHA256 (`dsh-auth-*`) vinculada al secreto de sesión local (`$DSH_HOME/.credentials.yaml`).

Cualquier dispositivo que intente conectarse desde la red local o VPN recibe un error `401 / 403 Unauthorized`.

### Cómo lo resuelve este puente:
1. Escucha de forma exclusiva en la interfaz privada de tu VPN (`10.x.x.x` o `100.x.x.x`), blindando la red contra accesos desde Wi-Fi compartidas o LANs públicas.
2. Reescribe el encabezado `Host` hacia `127.0.0.1:52710` (o el puerto dinámico activo de DSH).
3. Inyecta al vuelo la cookie de autenticación HMAC generada con el secreto de tu máquina.
4. Redirige tanto peticiones HTTP como el handshake de WebSockets (`ws://`) de forma bidireccional, transparente y sanitizada contra inyecciones CRLF.

---

## 📂 Estructura del Proyecto

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

## 📄 Licencia y Créditos
- **Autoría de Edición Endurecida:** Ismael Muñoz Reyes
- **Proyecto:** Tinta y Nodos
- **Licencia:** MIT License - Código libre para la comunidad de desarrolladores de DeepSeek Harness.
