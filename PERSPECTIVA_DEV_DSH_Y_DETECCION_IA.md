# DIARIO DE UN DEV DE HARNESS: RADIOGRAFÍA DE CÓDIGO IA, DOLOR COTIDIANO Y EL SANTO GRIAL DEL PROMPT CACHE
## Proyecto: DSH Mobile Companion (`C:\Users\ESCRITOR\Desktop\DSH-Mobile-Companion`)
**Autor:** Senior Dev & Entusiasta Hardcore de DeepSeek Harness (DSH)  
**Fecha:** Noviembre de 2026  
**Veredicto General:** Una joya de concepto que resuelve la peor pesadilla ergonómica del dev de DSH, pero con el "aroma" inconfundible de haber sido cocinado en un prompt de LLM a altas horas de la noche.

---

```
   ██████╗  ███████╗██╗  ██╗    ███╗   ███╗ ██████╗ ██████╗ ██╗██╗     ███████╗
   ██╔══██╗██╔════╝██║  ██║    ████╗ ████║██╔═══██╗██╔══██╗██║██║     ██╔════╝
   ██║  ██║███████╗███████║    ██╔████╔██║██║   ██║██████╔╝██║██║     █████╗  
   ██║  ██║╚════██║██╔══██║    ██║╚██╔╝██║██║   ██║██╔══██╗██║██║     ██╔══╝  
   ██████╔╝███████║██║  ██║    ██║ ╚═╝ ██║╚██████╔╝██████╔╝██║███████╗███████╗
   ╚═════╝ ╚══════╝╚═╝  ╚═╝    ╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚═╝╚══════╝╚══════╝
            [ ANÁLISIS DE CÓDIGO, AUDITORÍA DE IA & ROADMAP DE EVOLUCIÓN ]
```

---

## PRÓLOGO: EL CONTEXTO DE UN DEV QUE VIVE EN DSH

Si programas con DeepSeek Harness todos los días, sabes exactamente de qué hablo. DSH no es un simple "chat de IA"; es un arnés de ejecución autónoma para ingeniería de software. Corres subagentes en paralelo, orquestas workflows que auditan 200 archivos de golpe, ejecutas suites de pruebas en sandbox y dejas al modelo refactorizando arquitecturas enteras mientras la terminal escupe llamadas a herramientas como ametralladora.

Pero DSH tiene dos cadenas invisibles que te atan al escritorio:
1. **El búnker local `127.0.0.1`:** Por seguridad estricta, la interfaz Web GUI de DSH (`dsh web`) se niega en redondo a escuchar en `0.0.0.0` y exige una cookie de sesión firmada criptográficamente con HMAC-SHA256 (`dsh-auth-*`), atada a un secreto efímero en `$USERPROFILE/.dsh/.credentials.yaml`. No hay forma nativa de abrirla en tu iPad o teléfono desde el sofá.
2. **Las pausas de aprobación (Sandbox y `ask_user_question`):** Estás en medio de un refactor crítico. Dejaste al agente trabajando y te levantaste por un café o te fuiste a cenar. Llegas 45 minutos después y descubres que a los 2 minutos el agente se detuvo pidiendo confirmación de permisos `danger-full-access` o haciendo una pregunta sobre qué librería preferías. 43 minutos de computación y tiempo de entrega tirados a la basura.

Cuando vi este repositorio `DSH-Mobile-Companion`, sentí esa descarga de dopamina que solo un dev comprende: **¡Alguien se tomó la molestia de empaquetar un proxy inverso ligero en Node.js que finge ser el navegador local, calcula la cookie HMAC al vuelo y te lo sirve por ZeroTier/Tailscale!**

Sin embargo, como programador senior con el colmillo retorcido, abrí cada archivo con lupa. Y lo que encontré es fascinante: una mezcla magistral de ingeniería de prompts, genialidad arquitectónica, y al mismo tiempo, los tics y sesgos más reveladores de código generado por un LLM (ChatGPT/Claude/Gemini).

A continuación, va mi radiografía completa, sin pelos en la lengua.

---

# PARTE 1: DETECTOR DE CÓDIGO GENERADO POR IA (RADIOGRAFÍA IMPLACABLE)

Cualquiera que haya interactuado con modelos de lenguaje durante los últimos años reconoce los "aromas" (*AI smells*). No se trata de que el código sea malo —de hecho, es funcional y elegante en muchos aspectos— sino de que exhibe patrones sintácticos, estructurales y pedagógicos que ningún humano apurado escribe de forma natural.

### Score Global Estimado de Generación por IA: **93%**
*(El 7% restante corresponde a la directiva humana: la idea de negocio, el conocimiento del secreto de DSH y la integración con ZeroTier).*

---

### 1.1. Los "Tics" Pedagógicos y Comentarios de Libro de Texto

Un desarrollador humano senior que escribe un script puente para resolver su propio problema escribe comentarios breves, sarcásticos o funcionales (ej. `// hack para saltarse el auth de dsh`, `// TODO: checar si tailscale cambia de ip`).

En `bridge.mjs` y `run-hidden.vbs`, el código parece sacado de un tutorial de O'Reilly o de la respuesta de un asistente explicándole a un estudiante de primer semestre:

1. **Estructura de esquemas numerados en comentarios (`bridge.mjs`, L86-151):**
   ```javascript
   // 1. Prefer explicit VPN interface names (ZeroTier, Tailscale, WireGuard, TUN/TAP)
   ...
   // 2. Tailscale CGNAT subnet (100.64.0.0/10 -> 100.64.0.0 to 100.127.255.255)
   ...
   // 3. ZeroTier / Private Class A 10.x.x.x subnet
   ...
   // 4. Common LAN IPv4 (192.168.x.x or 172.16-31.x.x)
   ...
   // 5. Fallback to any non-internal IPv4
   ```
   Y exactamente el mismo tic en `run-hidden.vbs` (L12-42):
   ```vbscript
   ' 1. Prioritize bundled DSH runtime Node.js (guaranteed to be compatible and present)
   ...
   ' 2. Check standard Windows Node.js installation paths
   ...
   ' 3. Fallback to system PATH 'node'
   ```
   **Por qué delata a la IA:** Los LLMs tienen una fuerte tendencia en su entrenamiento RLHF a generar listas ordenadas ("1, 2, 3..."). Rara vez un humano escribe esa taxonomía tan pulcra en un script interno a menos que esté redactando documentación pública.

2. **Comentarios redundantes con explicaciones entre paréntesis (`run-hidden.vbs`, L44):**
   ```vbscript
   ' Run node in background with window hidden (0), without waiting for completion (False)
   WshShell.Run """" & strNodeExe & """ """ & strBridgeScript & """", 0, False
   ```
   Explicar exactamente qué significa el parámetro `0` y el parámetro `False` entre paréntesis es la firma clásica de Claude o ChatGPT asegurándose de que el usuario entienda la llamada a la API de Windows Script Host.

---

### 1.2. Nombres de Variables Canónicos e Hiper-Descriptivos

Revisemos las funciones de red en `bridge.mjs` (L83-84):
```javascript
const isIpv4 = (a) => (a.family === "IPv4" || a.family === 4) && !a.internal;
const isNotLinkLocal = (addr) => !addr.startsWith("169.254.");
```
Un dev humano en medio del fragor suele escribir `a.family.includes('4') && !a.internal && !a.address.startsWith('169.254')` en línea dentro del `filter` o `find`. Crear mini-predicados nombrados como `isNotLinkLocal` con nombres extraídos de la especificación RFC 3927 es puro estilo "Clean Code de libro" promovido por los modelos de IA.

Mismo caso en `run-hidden.vbs`:
`strCurrentDir`, `strBridgeScript`, `strUserProfile`, `strDshNode`, `strNodeExe`, `strProgFiles`, `strProgFilesX86`, `strLocalApp`.
El uso riguroso de notación húngara de los 90 (`str...`) en VBScript es un rasgo típico de prompts donde el modelo recurre a la documentación clásica de Microsoft MSDN de su corpus.

---

### 1.3. La "Reinvención de la Rueda": El Polyfill Anacrónico de Base64URL

Esta es una de las pruebas técnicas más contundentes en `bridge.mjs` (L171-185):
```javascript
function decodeBase64Url(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(
    value.replaceAll("-", "+").replaceAll("_", "/") + padding,
    "base64"
  );
}

function encodeBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}
```
**¿Por qué un humano no habría puesto esto en 2026?**
El proyecto usa sintaxis moderna de ES Modules (`import ... from "node:http"`, `await detectTargetPort()`). Desde **Node.js v14.18.0** (hace más de 5 años), `Buffer` soporta la codificación nativa `'base64url'`:
```javascript
// La forma moderna y nativa en Node:
Buffer.from(value, "base64url");
buffer.toString("base64url");
```
¿Por qué el código tiene 15 líneas calculando `padding` con módulo 4 y reemplazando signos de más y diagonales? Porque los LLMs tienen en su memoria vectorial miles de respuestas antiguas de StackOverflow (2015-2020) sobre "How to do base64url in Node.js" antes de que existiera el soporte nativo. La IA regurgitó el polyfill clásico sin percatarse de que el runtime de DSH corre sobre Node 20+.

---

### 1.4. Arquitectura de Ilusión Cosmética: El Caso de `findVpnIp()` vs `BIND_HOST`

Este es el síntoma más revelador de cómo piensa un LLM:
En `bridge.mjs`, se le dedica una función monumental de 77 líneas (`findVpnIp()`, L77-154) a inspeccionar adaptadores, buscar patrones regex de ZeroTier/Tailscale y calcular subredes CGNAT (`second >= 64 && second <= 127`).

Sin embargo, al final del archivo:
```javascript
16:  const BIND_HOST = process.env.DSH_BIND_HOST || "0.0.0.0";
...
296: server.listen(LISTEN_PORT, BIND_HOST, () => { ... });
```
¡El servidor **nunca hace bind** a la IP de la VPN detectada! Escucha en `0.0.0.0` (todas las interfaces) y la variable `DISPLAY_IP` se usa única y exclusivamente para hacer un `console.log` cosmético:
```javascript
log(`Ready! Access from mobile via: http://${accessIp}:${LISTEN_PORT}`);
```
**Análisis técnico:** Un humano que programa esta solución para proteger su máquina se asegura de que el socket de escucha haga `server.listen(PORT, vpnIp)`. La IA, al responder a un prompt del tipo *"crea un bridge que detecte la IP de ZeroTier y la muestre al usuario para conectarse"*, cumplió literalmente la instrucción: detectó la IP y la mostró, pero dejó el socket en `0.0.0.0`. Esto provocó la vulnerabilidad crítica (VULN-01) identificada en la auditoría.

---

### 1.5. El Patrón "StackOverflow Condensado" en Proxy HTTP y WebSockets

Observa el manejo de WebSocket Upgrade en `bridge.mjs` (L272-290):
```javascript
const targetSocket = net.connect(TARGET_PORT, TARGET_HOST, () => {
  let reqRaw = `${clientReq.method} ${clientReq.url} HTTP/1.1\r\n`;
  for (const [key, value] of Object.entries(targetHeaders)) {
    if (Array.isArray(value)) {
      for (const v of value) reqRaw += `${key}: ${v}\r\n`;
    } else if (value !== undefined) {
      reqRaw += `${key}: ${value}\r\n`;
    }
  }
  reqRaw += "\r\n";
  targetSocket.write(reqRaw);
  if (clientHead && clientHead.length) {
    targetSocket.write(clientHead);
  }
  clientSocket.pipe(targetSocket);
  targetSocket.pipe(clientSocket);
});
```
Este bloque es el arquetipo de respuesta de ChatGPT ante la pregunta: *"¿Cómo hago proxy de WebSockets en Node.js puro sin dependencias como http-proxy o ws?"*.
- **Lo que la IA hizo bien:** Logró conectar dos sockets TCP con `.pipe()`.
- **Los casos borde que un dev a las 3:00 AM sí habría sufrido:**
  1. Si no llamas a `clientSocket.pause()` antes de `net.connect()`, cualquier frame WebSocket enviado inmediatamente después del handshake HTTP se desborda o se pierde en el buffer antes de que `targetSocket` esté listo.
  2. Si `targetSocket` falla (error en L292), simplemente hace `clientSocket.destroy()`. El celular ve un `ECONNRESET` seco en lugar de un código HTTP limpio `502 Bad Gateway`.
  3. No sanitiza los valores de los encabezados contra inyección CRLF (`\r\n`).

Y en la parte HTTP (L246-249):
```javascript
proxyReq.on("error", (err) => {
  clientRes.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
  clientRes.end(`DSH Bridge Error: ...`);
});
```
Cualquier programador que ha trabajado con streaming (SSE) sabe que si el backend de IA falla a mitad de la respuesta cuando los tokens ya empezaron a fluir, `clientRes.writeHead` lanza la excepción no controlada `ERR_HTTP_HEADERS_SENT` y mata el proceso Node. La IA casi siempre olvida verificar `if (!clientRes.headersSent)`.

---

### 1.6. "Fantasmas" de Prompts Anteriores en los Scripts Batch

En `stop.bat` (L3):
```batch
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*bridge.mjs*' -or $_.CommandLine -like '*zt-bridge.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
```
¿De dónde salió `*zt-bridge.mjs*`? En el repositorio no existe ningún archivo llamado `zt-bridge.mjs`.
Esto es un residuo evolutivo de prompts. En una primera iteración, el usuario o la IA llamaron al archivo `zt-bridge.mjs` (ZeroTier Bridge). En la siguiente iteración lo renombraron a `bridge.mjs`, pero la IA mantuvo el término anterior "por si acaso".

---

# PARTE 2: IMPACTO EN EL DÍA A DÍA DE UN DEV DE DEEPSEEK HARNESS

Más allá de los "aromas" de IA en el código, hablemos de lo importante: **¿Por qué esta herramienta es oro molido puro para quienes usamos DSH a diario?**

### 2.1. El Dolor Real: La Esclavitud de la Silla de Escritorio

Cuando trabajas en desarrollo asistido por agentes, el flujo de trabajo cambia radicalmente. Ya no pasas 8 horas tecleando código línea por línea. Pasas el tiempo:
- Planteando objetivos de alto nivel.
- Revisando planes de trabajo (`todo_write`).
- Aprobando escalaciones de permisos (`workspace-write` / `danger-full-access`).
- Esperando a que el subagente termine una ejecución larga de pruebas o un refactor multi-archivo.

**El cuello de botella humano:**
Estar encadenado a la silla frente a la pantalla solo para esperar que una barra de progreso se mueva o para dar un clic en "Aprobar" es mortal para la productividad y la salud mental. Con DSH Mobile Companion:
- **Monitoreo desde el sofá o la cama:** Abres la PWA en tu iPhone o tablet Android, y ves el stream de tokens en tiempo real con la misma fluidez que en la PC de escritorio.
- **Desbloqueo instantáneo:** Cuando el agente pausa con un prompt de confirmación o una pregunta interactiva (`ask_user_question`), tocas la pantalla de tu teléfono, respondes en 5 segundos y el agente continúa trabajando sin perder media hora de espera.

---

### 2.2. La Magia del Prompt Cache Intacto (Por qué DSH cuida tu bolsillo y otros clientes no)

Este es el punto técnico más crucial y donde el 99% de los desarrolladores no comprende la diferencia entre clientes web genéricos y DeepSeek Harness.

#### El Desastre Financiero de OpenWebUI / OpenHanako / Custom Web Frontends:
Muchos desarrolladores intentan resolver el acceso móvil montando interfaces web genéricas (como OpenWebUI, LibreChat o clientes ligeros) conectadas directamente a la API de DeepSeek o Gemini.
- Cada vez que envías un mensaje en una app web genérica, el frontend suele reordenar el historial, inyectar timestamps dinámicos en el system prompt o alterar el formato de las herramientas (tools).
- **Consecuencia:** Se rompe el prefijo del prompt (*Prompt Cache Miss*).
- Si tu sesión de programación lleva acumulados 80,000 tokens de contexto entre archivos leídos, ASTs y diffs de git, **cada mensaje subsiguiente te cobra los 80,000 tokens completos como tokens de entrada no cacheados**.
- A $0.14 por millón de tokens en DeepSeek (o peor aún en modelos de frontera como Claude 3.5 Sonnet a $3.00/M), una tarde de trabajo móvil termina costándote decenas de dólares.

#### Por Qué DSH Mobile Companion Mantiene el Caché al 100%:
Este proyecto **no es un cliente nuevo ni un wrapper de API**. Es un **puente de transporte transparente hacia la misma sesión activa de DeepSeek Harness**.
- DSH está diseñado con un motor de prefijo rígido que conserva intacto el bloque de tokens anterior.
- En la API de DeepSeek, los tokens cacheados cuestan **$0.014 por millón** (un **90% de descuento directo**).
- Como el puente se conecta a la instancia de `dsh web` ya viva en tu máquina local, aprovecha exactamente el mismo cache hit que si estuvieras tecleando en el monitor de tu PC.
- No gastas un solo centavo extra. Tienes el cerebro completo de tu sesión local con su historial y caché intacto en la palma de tu mano.

---

### 2.3. Cero Exposición Pública y Privacidad Blindada

Otras alternativas populares para acceder remotamente a la PC (como túneles de `ngrok`, `localtunnel` o `Cloudflare Tunnels`) abren URLs en internet público.
Considerando que DSH tiene acceso para ejecutar comandos PowerShell y modificar archivos en tu sistema operativo, abrir un túnel público —incluso con contraseña básica— es jugar a la ruleta rusa con tu máquina.

Al apoyarse exclusivamente en la malla de red privada cifrada de **ZeroTier** o **Tailscale**:
- Ningún puerto se abre en tu router (sin NAT traversal expuesto).
- La comunicación viaja encriptada punto a punto entre tus propios dispositivos.
- Nadie en internet sabe que tu puerto `57420` existe.

---

# PARTE 3: IDEAS Y MEJORAS PARA LLEVARLO AL SIGUIENTE NIVEL (ROADMAP DEV)

Como usuario diario de DSH, este proyecto tiene el potencial de convertirse en el estándar de facto de la comunidad para control móvil. Aquí están las funciones que transformarían esta herramienta de un "script ingenioso" a un producto indispensable:

### 3.1. Funcionalidades Críticas para el Día a Día

1. **Notificaciones Push Móviles Nativas (Vía NTFY.sh / Pushover / Webhooks):**
   - **El dolor:** No quieres tener la pantalla del celular encendida viendo cómo el agente piensa durante 8 minutos.
   - **La solución:** Un interceptor en el proxy que detecte los eventos de WebSocket cuando:
     * Una sesión cambia de estado a `idle` o `finished`.
     * Se dispara un `ask_user_question` o un requerimiento de confirmación de sandbox.
     * Ocurre un error fatal en una herramienta.
   - Envía un push notification inmediato a tu teléfono con [ntfy.sh](https://ntfy.sh) (gratuito, sin cuenta, ultra rápido):  
     *"DSH: Tarea 'Refactor Auth' finalizada con éxito (4 subagentes completados)"*.

2. **Widget Móvil de Telemetría de la PC (Hardware Vitals):**
   - Un dev que corre DSH suele correr compilaciones pesadas (`pnpm build`, tests en Docker).
   - Inyectar una pequeña barra flotante colapsable en la esquina superior de la Web GUI móvil que muestre:
     * Uso de CPU / RAM de la PC.
     * Carga y VRAM de GPU (vital si corres modelos locales en Ollama).
     * **Nivel de batería y estado de carga:** Si estás en una laptop en otra habitación, necesitas saber si la máquina está por apagarse.

3. **Prevención de Suspensión de Windows (Insonmio / Keep-Awake Automático):**
   - Windows 11 tiene la mala costumbre de mandar la PC a suspensión si no detecta actividad de teclado o ratón durante 15 minutos, matando tus agentes a medio camino.
   - El puente de Node puede invocar periódicamente la API de Windows `SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED)` mientras haya sesiones activas en DSH, impidiendo que la máquina se duerma.

4. **Botón Rápido de Dictado por Voz Optimizado:**
   - Escribir prompts largos y estructurados con el teclado táctil del celular es incómodo.
   - Integrar un botón flotante con la Web Speech API nativa del navegador móvil o un micro-servicio Whisper local para dictarle tus requerimientos con lenguaje natural mientras caminas.

5. **Reconexión Automática con Buffer Offline:**
   - En el celular, cada vez que bloqueas la pantalla o cambias de app, el sistema operativo congela los sockets y el WebSocket se cae.
   - El puente debe implementar un mecanismo de *reconnect* con retroceso exponencial que rehidrate el estado de la GUI sin obligarte a refrescar la página manualmente.

---

### 3.2. Mejoras de Experiencia de Desarrollador (DX) para la Comunidad de GitHub

1. **Código QR en Terminal al Iniciar:**
   - En lugar de que el usuario tenga que copiar y pegar manualmente la IP `http://100.x.x.x:57420`, utilizar la librería `qrcode-terminal` (o una implementación ligera en ASCII) para renderizar un código QR en la consola de Windows.
   - El dev solo abre la cámara de su teléfono, apunta a la pantalla de la PC y ¡pum!, la PWA se abre al instante.

2. **Instalador de Un Solo Comando (One-Liner):**
   - En lugar de clonar el repo y ejecutar bats:
     ```powershell
     iwr -useb https://raw.githubusercontent.com/TU_USUARIO/dsh-mobile-companion/main/install.ps1 | iex
     ```
   - O distribuirlo como paquete global de npm/pnpm:
     ```bash
     npx dsh-mobile-companion
     ```

3. **Icono en la Bandeja del Sistema (Windows System Tray):**
   - Un pequeño ejecutable liviano en C# o un script de PowerShell que viva junto al reloj de Windows:
     * Círculo verde: DSH conectado y puente activo.
     * Círculo amarillo: Esperando túnel de Tailscale/ZeroTier.
     * Círculo rojo: DSH apagado.
     * Clic derecho: "Copiar URL móvil", "Ver logs en vivo", "Reiniciar", "Salir".

4. **Empaquetado como Plugin Oficial de DSH:**
   - En lugar de ser un proceso externo huérfano, integrarlo al ecosistema de plugins de DeepSeek Harness (`@dsh/plugin-mobile-companion`), de modo que se inicie y detenga automáticamente junto con el daemon principal de DSH.

---

# SÍNTESIS FINAL: EL DICTAMEN DEL DEV

`DSH-Mobile-Companion` es el ejemplo perfecto del poder de la IA en manos de un programador con visión de producto:
- **La idea es un 10/10:** Ataca el problema ergonómico número uno de DSH sin sacrificar la economía del Prompt Cache.
- **La implementación original tiene aroma de LLM:** Código de StackOverflow condensado, polyfills anacrónicos de base64url, comentarios de libro de texto y la contradicción flagrante de escuchar en `0.0.0.0` mientras prometía ser "100% privado".
- **El futuro es brillante:** Aplicando los parches de seguridad de la auditoría técnica e incorporando notificaciones push y código QR, este proyecto tiene todo para convertirse en una herramienta de cabecera obligatoria para cualquier ingeniero de software que use DeepSeek Harness.

*¡A aplicar los parches, prender Tailscale y programar desde la terraza!*
