# DSH Mobile Companion
> Acceso móvil remoto, modo satélite autónomo y sincronización directa para DeepSeek Harness mediante ZeroTier o Tailscale.
> 
> Edición Endurecida elaborada por Ismael Muñoz Reyes para Tinta y Nodos.

---

## Características Principales

- **Modo Híbrido Satélite:** Chatea en la calle directamente con tu propia API Key (Google Gemini o DeepSeek) cuando la PC esté apagada. Al encender la PC y conectar la VPN, sincroniza el historial en un clic.
- **Sincronización Directa sin Nube:** Las conversaciones satélite se guardan localmente en tu computadora en la carpeta `synced_chats/` en formatos Markdown y JSON, sin requerir GitHub, cuentas externas ni servidores intermediarios.
- **Acceso Remoto a la Web GUI de DSH:** Una vez conectado a tu PC, navega la interfaz completa de DeepSeek Harness en pantalla completa con soporte de WebSockets bidireccionales.
- **Seguro y Privado:** No abre puertos públicos en el módem ni router. Escucha estrictamente en la IP privada de la VPN (ZeroTier o Tailscale) para evitar cualquier exposición en redes locales compartidas.
- **Cero Dependencias Externas:** Programado en Node.js puro (`http`, `net`, `crypto`, `fs`). No requiere `npm install` ni paquetes de terceros, reduciendo a cero el riesgo de dependencias comprometidas.
- **Auto-inicio con Windows:** Corre en segundo plano sin consolas visibles mediante un script VBS silencioso.

---

## Modo Híbrido: Cómo Funciona

El sistema opera en dos modalidades complementarias:

### 1. En la calle o con la PC apagada (Modo Satélite)
1. Abre en tu celular la app PWA o entra desde el navegador a `http://<TU_IP_VPN>:57420/m`.
2. Ve al icono de engrane (⚙️) e ingresa tu API Key:
   - **Google Gemini:** Modelos `gemini-2.5-flash` o `gemini-2.5-pro` (clave gratuita desde [Google AI Studio](https://aistudio.google.com/app/apikey)).
   - **DeepSeek:** Modelos `deepseek-chat` o `deepseek-reasoner` (clave desde [DeepSeek Platform](https://platform.deepseek.com/api_keys)).
3. La clave se almacena únicamente en el `localStorage` de tu propio teléfono móvil; nunca se transmite a la PC ni a servidores de terceros.
4. Chatea con streaming fluido en tiempo real. La interfaz funciona como PWA instalable con Service Worker para arrancar sin demora.

### 2. Al encender la PC o conectar la VPN (Sincronización)
1. Tan pronto el celular detecta la PC encendida a través de ZeroTier o Tailscale, el indicador cambiará a **"⚡ Búnker Online"**.
2. Aparecerá un banner y botón de sincronización.
3. Pulsa **"Sincronizar"**: el puente guardará tu conversación en la PC dentro del directorio `synced_chats/` en formato `.md` y `.json`.
4. Pulsa **"Ir a DSH"** para pasar directamente a la interfaz web completa de DeepSeek Harness (`/`) con la sesión autenticada.

---

## Instalación Rápida

### 1. Requisitos
- Windows 10 u 11 con DeepSeek Harness instalado (el servicio utiliza el ejecutable de Node.js empaquetado en DSH de forma transparente).
- ZeroTier o Tailscale activo en la computadora y en el celular.

### 2. Configuración en la Computadora
1. Clona o descarga este repositorio:
   ```bash
   git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
   ```
2. Entra a la carpeta y ejecuta `install-autostart.bat`.
3. El script detectará la IP privada de tu VPN y configurará el inicio automático en segundo plano al arrancar Windows.

### 3. Uso en el Celular (Android / iOS)
1. Con la VPN conectada, entra desde el navegador a:
   ```text
   http://<TU_IP_VPN>:57420/m
   ```
   *(Ejemplo: `http://10.x.x.x:57420/m` en ZeroTier o `http://100.x.x.x:57420/m` en Tailscale)*
2. En el menú del navegador, selecciona **"Agregar a la pantalla principal"** o **"Instalar aplicación"**.
3. Ingresa tu API Key en la pantalla de bienvenida y el sistema queda listo para operar en cualquier momento.

---

## Rutas y Endpoints del Puente

El servidor `bridge.mjs` expone las siguientes rutas internas antes del proxy inverso:

- `GET /m` o `/offline`: Interfaz satélite PWA en estética oscura Cyberpunk Tinta y Nodos con soporte de streaming y cliente de IA local.
- `GET /dsh-companion/status`: Devuelve el estado de conectividad de la PC y del backend DSH (`{ status: "online", dshOnline: true, dshTargetPort: 52710 }`).
- `POST /dsh-companion/sync`: Recibe el historial de mensajes del móvil y lo almacena en `synced_chats/` en Markdown y JSON.
- `GET /dsh-companion/synced`: Lista las sesiones sincronizadas disponibles en el almacenamiento local.
- `GET /`: Redirige al backend oficial de DSH Web GUI inyectando la cookie de autenticación HMAC generada a partir de `$DSH_HOME/.credentials.yaml`.

---

## Estructura del Proyecto

```text
dsh-mobile-companion/
├── bridge.mjs             # Servidor proxy inverso con rutas satélite y sync en Node.js puro
├── m.html                 # Aplicación web satélite PWA Cyberpunk (Gemini + DeepSeek)
├── sw.js                  # Service Worker para ejecución offline-ready
├── manifest.webmanifest   # Manifiesto de aplicación PWA para Android e iOS
├── icon.svg               # Icono vectorial de alta resolución para la PWA
├── synced_chats/          # Almacenamiento local de conversaciones sincronizadas (.md y .json)
├── run-hidden.vbs         # Lanzador silencioso en segundo plano
├── install-autostart.bat  # Configuración del servicio en inicio de Windows
├── uninstall-autostart.bat# Desinstalador limpio del servicio
├── start.bat              # Inicio manual del puente
├── stop.bat               # Detención segura del proceso
├── LICENSE                # Licencia de código abierto MIT
└── README.md              # Documentación oficial
```

---

## Licencia y Créditos
- Autoría de Edición Endurecida: Ismael Muñoz Reyes
- Proyecto: Tinta y Nodos
- Licencia: MIT License - Código libre para la comunidad de DeepSeek Harness.
