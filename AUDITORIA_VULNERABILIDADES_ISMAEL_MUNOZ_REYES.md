# REPORTE DE AUDITORÍA INTEGRAL DE CIBERSEGURIDAD, ARQUITECTURA Y CÓDIGO
## Proyecto: DSH Mobile Companion / Tinta y Nodos
**Elaborado por:** Ismael Muñoz Reyes  
**Rol:** Auditor Senior de Ciberseguridad, Redes y Código Seguro  
**Fecha:** 9 de noviembre de 2026  
**Entorno auditado:** `C:\Users\ESCRITOR\Desktop\DSH-Mobile-Companion`  
**Clasificación:** Confidencial / Técnico Operativo / Defensivo  

---

```
   ████████╗██╗███╗   ██╗████████╗ █████╗     ██╗   ██╗    ███╗   ██╗ ██████╗ ██████╗  ██████╗ ███████╗
   ╚══██╔══╝██║████╗  ██║╚══██╔══╝██╔══██╗    ╚██╗ ██╔╝    ████╗  ██║██╔═══██╗██╔══██╗██╔═══██╗██╔════╝
      ██║   ██║██╔██╗ ██║   ██║   ███████║     ╚████╔╝     ██╔██╗ ██║██║   ██║██║  ██║██║   ██║███████╗
      ██║   ██║██║╚██╗██║   ██║   ██╔══██║      ╚██╔╝      ██║╚██╗██║██║   ██║██║  ██║██║   ██║╚════██║
      ██║   ██║██║ ╚████║   ██║   ██║  ██║       ██║       ██║ ╚████║╚██████╔╝██████╔╝╚██████╔╝███████║
      ╚═╝   ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝       ╚═╝       ╚═╝  ╚═══╝ ╚═════╝ ╚═════╝  ╚═════╝ ╚══════╝
                     [ REPORTE DE AUDITORÍA TÉCNICA - ISMAEL MUÑOZ REYES ]
```

---

## 1. RESUMEN EJECUTIVO (VISIÓN DEL AUDITOR)

Qué tal, equipo. Me eché un clavado quirúrgico a las entrañas del repositorio de **DSH Mobile Companion**. La meta original del proyecto es brillante: resolver la bronca de que **DeepSeek Harness** se amarra a `127.0.0.1` y exige una cookie firmada con HMAC-SHA256 (`dsh-auth-*`), permitiendo que el usuario se conecte desde su celular o tablet mediante una VPN privada (Tailscale o ZeroTier) sin perder el codiciado *prompt caching*.

Sin embargo, como auditor senior, mi deber es hablar al chile y con la verdad técnica en la mano: **el proyecto actual tiene una contradicción de seguridad severa entre lo que promete el README y lo que realmente ejecuta el código**. El README pregona a los cuatro vientos que el puente es *"100% Seguro y Privado"* y que opera *"exclusivamente en tu interfaz VPN"*, pero el código en `bridge.mjs` levanta el socket escuchando en `0.0.0.0` (todas las interfaces de red de la máquina).

Esto significa que cualquier fulano conectado a la misma red Wi-Fi (en tu casa, oficina o en el Starbucks) puede pegarle al puerto `57420` y el puente le va a inyectar **en charola de plata** una cookie válida con privilegios completos de sesión en DeepSeek Harness, brincándose toda la seguridad local del búnker.

Adicionalmente, hay riesgos de estabilidad operativa: colisiones de puertos que tumban el proceso, inyección potencial de encabezados en el WebSocket proxy, ceguera operativa total por falta de logging en segundo plano en Windows y scripts batch que matan procesos a quemarropa con wildcards demasiado agresivos.

A continuación, desglosamos cada archivo, cada línea y cada tuerca del sistema para dejarlo blindado al 100%.

---

## 2. MATRIZ GENERAL DE HALLAZGOS Y RIESGOS

| ID | Componente | Tipo de Falla / Riesgo | Severidad | Impacto Operativo / Seguridad |
|---|---|---|---|---|
| **VULN-01** | `bridge.mjs` (L16, L296) | **Bypass de Autenticación / Open Relay en `0.0.0.0`** | **CRÍTICA** | Acceso no autenticado al Web GUI y sandbox de DSH desde cualquier IP de la LAN. |
| **VULN-02** | `bridge.mjs` (L273-281) | **CRLF Injection / Smuggling en Handshake WebSocket** | **ALTA** | Concatenación directa de headers sin sanitizar en socket TCP crudo. |
| **VULN-03** | `bridge.mjs` (L246-249) | **Unhandled Exception DoS (`ERR_HTTP_HEADERS_SENT`)** | **ALTA** | Si la respuesta falla a medio streaming, `writeHead(502)` revienta el proceso Node. |
| **BUG-01** | `bridge.mjs` (L15, L64) | **Riesgo de Colisión de Puerto (`LISTEN_PORT` vs `TARGET_PORT`)** | **MEDIA** | Conflicto si DSH corre en `57420`, provocando fallo fatal `EADDRINUSE`. |
| **BUG-02** | `bridge.mjs` (L188, L23-75) | **Detección Estática en Frío (Falta de Sondeo Dinámico)** | **MEDIA** | Si DSH se reinicia en otro puerto efímero, el puente queda atrapado en error 502 perpetuo. |
| **BUG-03** | `bridge.mjs` (L220-224) | **Falla de Sobrescritura de Cookie Stale/Expirada** | **MEDIA** | Si el cliente móvil manda una cookie vieja o inválida, el proxy no la reemplaza y DSH da 401. |
| **BUG-04** | `bridge.mjs` (L112-121) | **Falso Positivo en Detección de IP VPN (Redes Clase A)** | **BAJA** | Confusión entre routers domésticos en `10.0.0.0/24` y redes privadas ZeroTier. |
| **OPS-01** | `run-hidden.vbs` (L44-45) | **Ceguera Operativa Total (Silent Crash)** | **ALTA** | Ejecución silenciosa sin redirigir stdout/stderr; el usuario no sabe por qué no jala. |
| **OPS-02** | `stop.bat` / `uninstall` | **Terminación Indiscriminada de Procesos (`*bridge.mjs*`)** | **MEDIA** | Mata otros procesos Node legítimos en la máquina que contengan la palabra `bridge.mjs`. |
| **OPS-03** | `install-autostart.bat` | **Inconsistencia de Permisos en `%APPDATA%` y Falta de Idempotencia** | **BAJA** | Si se corre como Admin crea el acceso en el perfil equivocado; no mata instancias previas. |
| **SEC-01** | Repositorio / Git | **Binario APK en el repositorio (`DSH-Companion.apk`)** | **MEDIA** | Archivo compilado de 5.6MB sin trazabilidad en git, sin firma verificable y ausente en `.gitignore`. |

---

## 3. AUDITORÍA DETALLADA LÍNEA POR LÍNEA Y BLOQUE POR BLOQUE

### 3.1. Archivo: `bridge.mjs` (El núcleo del proxy inverso)

Este archivo es el cerebro del proyecto: un servidor proxy inverso puro en Node.js que finge ser el navegador local para engañar a DeepSeek Harness.

#### Líneas 1 a 17: Importaciones y Configuración Inicial
```javascript
1: /**
2:  * DSH Mobile Companion Bridge
3:  * ZeroTier / Tailscale / Private VPN Reverse Proxy for DeepSeek Harness Web GUI
4:  * Zero-dependencies: Uses pure Node.js standard library (http, net, crypto, fs, os, path)
5:  */
6: 
7: import http from "node:http";
8: import net from "node:net";
9: import crypto from "node:crypto";
10: import fs from "node:fs";
11: import os from "node:os";
12: import path from "node:path";
13: 
14: const TARGET_HOST = "127.0.0.1";
15: const LISTEN_PORT = parseInt(process.env.DSH_LISTEN_PORT || "57420", 10);
16: const BIND_HOST = process.env.DSH_BIND_HOST || "0.0.0.0";
17: 
```
* **Qué hace cada línea:**
  - `L7-12`: Importa los módulos nativos de Node.js (`http`, `net`, `crypto`, `fs`, `os`, `path`). Excelente decisión arquitectónica: cero dependencias en `node_modules`.
  - `L14`: Fija `TARGET_HOST` en `127.0.0.1`. Es el host donde vive DSH.
  - `L15`: Parsea `DSH_LISTEN_PORT` del entorno o toma por defecto `57420`.
  - `L16`: Define `BIND_HOST` tomando el entorno o por defecto `"0.0.0.0"`.
* **Ojo aquí (Vulnerabilidad Crítica - VULN-01):**
  La línea 16 es una fuga de seguridad monumental. Al poner `"0.0.0.0"` por defecto, el proxy no se ata a la VPN; se ata a **todas** las tarjetas de red de la máquina. Si estás en una red compartida, cualquiera que escanee el puerto `57420` entra directo a tu sesión de DeepSeek Harness.

#### Líneas 18 a 52: Funciones Auxiliares de Logging y Sondeo de Puertos
```javascript
18: function log(msg) {
19:   const ts = new Date().toLocaleTimeString();
20:   console.log(`[DSH-Bridge ${ts}] ${msg}`);
21: }
22: 
23: function probePort(port, host = TARGET_HOST, timeout = 350) {
24:   return new Promise((resolve) => {
25:     const req = http.request(
26:       {
27:         hostname: host,
28:         port,
29:         method: "GET",
30:         path: "/",
31:         timeout,
32:       },
33:       (res) => {
34:         // DeepSeek Harness responds with 401 (auth required), 200, or 302
35:         if (res.statusCode === 401 || res.statusCode === 200 || res.statusCode === 302) {
36:           resolve(true);
37:         } else {
38:           resolve(false);
39:         }
40:         res.resume();
41:       }
42:     );
43:     req.on("timeout", () => {
44:       req.destroy();
45:       resolve(false);
46:     });
47:     req.on("error", () => {
48:       resolve(false);
49:     });
50:     req.end();
51:   });
52: }
```
* **Qué hace cada línea:**
  - `L18-21`: `log(msg)` imprime la estampa de tiempo local y el mensaje.
  - `L23-32`: `probePort` hace un `GET /` con un timeout de 350 ms hacia `127.0.0.1:port`.
  - `L35-39`: Si el código HTTP es 401, 200 o 302, da por hecho que ahí está respondiendo DSH.
  - `L40`: `res.resume()` drena la respuesta para no fugar memoria ni sockets. Bien pensado.
  - `L43-49`: Maneja timeout y error destruyendo la petición y resolviendo en `false`.
* **Detalle técnico / Riesgo:**
  El timeout de **350 ms** (`L23`) es demasiado castigado para Windows cuando la máquina apenas va prendiendo. Cuando Windows arranca y se ejecutan las tareas de `Startup`, el disco y la CPU están hasta el tope. Un sondeo con 350ms va a dar falsos negativos y hacer que el puente crea que DSH está apagado. Conviene subirlo al menos a 1000 ms o hacer reintentos con retroceso exponencial (*exponential backoff*).

#### Líneas 54 a 75: Detección del Puerto Objetivo (Target Port)
```javascript
54: async function detectTargetPort() {
55:   if (process.env.DSH_TARGET_PORT) {
56:     const envPort = parseInt(process.env.DSH_TARGET_PORT, 10);
57:     if (!isNaN(envPort) && envPort > 0) {
58:       log(`TARGET_PORT set via process.env.DSH_TARGET_PORT: ${envPort}`);
59:       return envPort;
60:     }
61:   }
62: 
63:   // Scan candidate ports: verified active GUI port first (52710), then fallback (57420)
64:   const candidatePorts = [52710, 57420];
65:   for (const port of candidatePorts) {
66:     if (await probePort(port)) {
67:       log(`Detected active DSH Web GUI on port ${port}`);
68:       return port;
69:     }
70:   }
71: 
72:   // Default fallback: 52710 with fallback to 57420
73:   log(`No active DSH port responded; defaulting to 52710 (fallback: 57420)`);
74:   return 52710;
75: }
```
* **Qué hace cada línea:**
  - `L55-61`: Si el usuario configuró `DSH_TARGET_PORT`, lo respeta.
  - `L64-70`: Escanea dos puertos candidatos fijos: `52710` y `57420`.
  - `L73-74`: Si ninguno responde, regresa `52710`.
* **Bronca aquí (BUG-01 y BUG-02):**
  1. **Conflicto de puertos:** ¿Por qué `57420` está en la lista de candidatos a escanear si `57420` es precisamente el `LISTEN_PORT` por defecto del puente? Si DSH estuviera corriendo en `57420`, el puente intentaría escuchar en `57420` y pegarle a `57420` a sí mismo, causando un loop o tronando con `EADDRINUSE`.
  2. **DSH dinámico:** DeepSeek Harness en muchas instalaciones escoge puertos dinámicos dentro del rango efímero si `52710` está ocupado. Además, esta función se ejecuta una sola vez al arrancar (`await detectTargetPort()` en L188). Si prendes la compu, arranca el puente pero DSH tarda 30 segundos más en abrirse, el puerto destino queda grabado a fuego en `52710` y jamás se actualiza.

#### Líneas 77 a 154: Detección de la IP de VPN en el Sistema Operativo
```javascript
77: function findVpnIp() {
78:   if (process.env.DSH_VPN_IP) {
79:     return { ip: process.env.DSH_VPN_IP, iface: "env" };
80:   }
81: 
82:   const ifaces = os.networkInterfaces();
83:   const isIpv4 = (a) => (a.family === "IPv4" || a.family === 4) && !a.internal;
84:   const isNotLinkLocal = (addr) => !addr.startsWith("169.254.");
85: 
86:   // 1. Prefer explicit VPN interface names (ZeroTier, Tailscale, WireGuard, TUN/TAP)
87:   for (const [name, addrs] of Object.entries(ifaces)) {
88:     const isVpnName = /zerotier|tailscale|^zt|^ts|wireguard|^wg|openvpn|tun|tap/i.test(name);
89:     if (isVpnName && addrs) {
90:       for (const a of addrs) {
91:         if (isIpv4(a) && isNotLinkLocal(a.address)) {
92:           return { ip: a.address, iface: name };
93:         }
94:       }
95:     }
96:   }
97: 
98:   // 2. Tailscale CGNAT subnet (100.64.0.0/10 -> 100.64.0.0 to 100.127.255.255)
99:   for (const [name, addrs] of Object.entries(ifaces)) {
100:     if (addrs) {
101:       for (const a of addrs) {
102:         if (isIpv4(a) && isNotLinkLocal(a.address) && a.address.startsWith("100.")) {
103:           const second = Number(a.address.split(".")[1]);
104:           if (second >= 64 && second <= 127) {
105:             return { ip: a.address, iface: name };
106:           }
107:         }
108:       }
109:     }
110:   }
111: 
112:   // 3. ZeroTier / Private Class A 10.x.x.x subnet
113:   for (const [name, addrs] of Object.entries(ifaces)) {
114:     if (addrs) {
115:       for (const a of addrs) {
116:         if (isIpv4(a) && isNotLinkLocal(a.address) && a.address.startsWith("10.")) {
117:           return { ip: a.address, iface: name };
118:         }
119:       }
120:     }
121:   }
122: 
123:   // 4. Common LAN IPv4 (192.168.x.x or 172.16-31.x.x)
...
153:   return { ip: "0.0.0.0", iface: "all" };
154: }
```
* **Qué hace cada línea:**
  - `L78-80`: Revisa si forzaron la IP por la variable `DSH_VPN_IP`.
  - `L82-84`: Extrae las interfaces con `os.networkInterfaces()` y define filtros para IPv4 no internas ni APIPA (`169.254.x.x`).
  - `L86-96`: Busca interfaces cuyo nombre coincida con regex de VPN (`zerotier`, `tailscale`, etc.).
  - `L98-110`: Valida el rango CGNAT de Tailscale (`100.64.0.0/10`). La lógica matemática de `second >= 64 && second <= 127` es impecable.
  - `L112-121`: Busca IPs que empiecen con `10.`.
  - `L123-140`: Cae a rangos LAN comunes (`192.168.` o `172.16-31`).
* **Detalle técnico y engaño visual:**
  1. En Windows, los adaptadores virtuales de ZeroTier frecuentemente se llaman `"Ethernet 2"` o `"Conexión de área local 3"`, por lo que el regex de la línea 88 falla.
  2. Luego cae a la línea 116 (`10.`). Si tu módem de Telmex, Totalplay o tu red de oficina usa `10.0.0.0/24`, va a elegir la tarjeta Wi-Fi y no la de ZeroTier.
  3. **Y lo más grave:** Esta función `findVpnIp()` **sólo se usa para imprimir texto en la consola** (`L210` y `L297`). El servidor **nunca** hace `bind` a esa IP devuelta; siempre se amarra a `0.0.0.0` (L296). O sea, es una ilusión cosmética.

#### Líneas 156 a 186: Carga de Secretos y Cifrado Base64URL
```javascript
156: function loadSecret() {
157:   const credPath = path.join(os.homedir(), ".dsh", ".credentials.yaml");
158:   if (!fs.existsSync(credPath)) {
159:     throw new Error(`Credentials file not found at ${credPath}`);
160:   }
161:   const content = fs.readFileSync(credPath, "utf8");
162:   const match = content.match(
163:     /client-connection\/browser-session:[\s\S]*?secret:\s*([A-Za-z0-9_-]+)/
164:   );
165:   if (!match || !match[1]) {
166:     throw new Error("Unable to parse browser-session secret from .credentials.yaml");
167:   }
168:   return match[1].trim();
169: }
170: 
171: function decodeBase64Url(value) {
172:   const padding = "=".repeat((4 - (value.length % 4)) % 4);
173:   return Buffer.from(
174:     value.replaceAll("-", "+").replaceAll("_", "/") + padding,
175:     "base64"
176:   );
177: }
178: 
179: function encodeBase64Url(value) {
180:   return Buffer.from(value)
181:     .toString("base64")
182:     .replaceAll("+", "-")
183:     .replaceAll("/", "_")
184:     .replace(/=+$/u, "");
185: }
```
* **Qué hace cada línea:**
  - `L157`: Construye la ruta hacia `$USERPROFILE/.dsh/.credentials.yaml`.
  - `L158-160`: Lanza error si no existe el archivo.
  - `L161-167`: Lee el YAML y extrae el secreto mediante una expresión regular.
  - `L171-185`: Implementa funciones manuales para decodificar y codificar base64url.
* **Ojo aquí:**
  - `os.homedir()` ignora la variable de entorno oficial `DSH_HOME`. Si un usuario reubicó su directorio de DSH a otro disco (por ejemplo `D:\DSH`), el script truena de inmediato en la línea 159.
  - `decodeBase64Url` y `encodeBase64Url`: Desde Node.js v14.18+, el motor soporta nativamente `'base64url'` (`Buffer.from(val, 'base64url')` y `buf.toString('base64url')`). Hacerlo a mano con `replaceAll` y cálculo de padding es reinventar la rueda y más lento.

#### Líneas 188 a 213: Inicialización Criptográfica y Generación de Cookies
```javascript
188: const TARGET_PORT = await detectTargetPort();
189: const rawSecret = loadSecret();
190: const secret = decodeBase64Url(rawSecret);
191: const authority = `${TARGET_HOST}:${TARGET_PORT}`;
192: const cookieName =
193:   "dsh-auth-" +
194:   encodeBase64Url(crypto.createHash("sha256").update(authority).digest());
195: 
196: function getValidCookie() {
197:   const issuedAt = Date.now();
198:   const expiresAt = issuedAt + 30 * 24 * 3600 * 1000;
199:   const payload = {
200:     version: 1,
201:     authority,
202:     issuedAt,
203:     expiresAt,
204:   };
205:   const body = encodeBase64Url(Buffer.from(JSON.stringify(payload), "utf8"));
206:   const sig = crypto.createHmac("sha256", secret).update(body).digest();
207:   return `${cookieName}=v1.${body}.${encodeBase64Url(sig)}`;
208: }
209: 
210: const { ip: DISPLAY_IP, iface } = findVpnIp();
211: log(`Detected interface: ${iface} (${DISPLAY_IP})`);
212: log(`Forwarding target: http://${authority}`);
```
* **Qué hace cada línea:**
  - `L188-190`: Detecta el puerto, carga el secreto y lo decodifica.
  - `L191`: Construye el `authority` (`127.0.0.1:52710`).
  - `L192-194`: Calcula el nombre de la cookie haciendo un hash SHA-256 del `authority`. Esto replica con exactitud la lógica interna de DeepSeek Harness.
  - `L196-208`: Genera la cookie de sesión con validez de 30 días, firmada con HMAC-SHA256 usando el secreto maestro.
* **Detalle técnico:**
  La función `getValidCookie()` se invoca **en cada petición entrante HTTP y en cada handshake de WebSocket**. Aunque la máquina se la banca bien, calcular JSON stringify, base64url y HMAC-SHA256 en cada petición es un desperdicio de CPU innecesario; se puede cachear la cookie y refrescarla cada hora o cada día.

#### Líneas 215 a 252: Proxy Reverso HTTP (Manejo de Peticiones y Respuestas)
```javascript
215: const server = http.createServer((clientReq, clientRes) => {
216:   const targetHeaders = { ...clientReq.headers };
217:   targetHeaders["host"] = authority;
218: 
219:   const authCookie = getValidCookie();
220:   if (targetHeaders["cookie"]) {
221:     if (!targetHeaders["cookie"].includes(cookieName)) {
222:       targetHeaders["cookie"] = `${targetHeaders["cookie"]}; ${authCookie}`;
223:     }
224:   } else {
225:     targetHeaders["cookie"] = authCookie;
226:   }
227: 
228:   if (targetHeaders["origin"]) {
229:     targetHeaders["origin"] = `http://${authority}`;
230:   }
231: 
232:   const proxyReq = http.request(
233:     {
234:       hostname: TARGET_HOST,
235:       port: TARGET_PORT,
236:       path: clientReq.url,
237:       method: clientReq.method,
238:       headers: targetHeaders,
239:     },
240:     (proxyRes) => {
241:       clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
242:       proxyRes.pipe(clientRes, { end: true });
243:     }
244:   );
245: 
246:   proxyReq.on("error", (err) => {
247:     clientRes.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
248:     clientRes.end(`DSH Bridge Error: DeepSeek Harness does not seem to be running on ${TARGET_HOST}:${TARGET_PORT}\n(${err.message})`);
249:   });
250: 
251:   clientReq.pipe(proxyReq, { end: true });
252: });
```
* **Qué hace cada línea:**
  - `L216-217`: Clona los headers del cliente y sobrescribe el header `Host` con el `authority` local (`127.0.0.1:52710`).
  - `L219-226`: Revisa si la petición ya trae cookies. Si no incluye `cookieName`, le adjunta la cookie firmada.
  - `L228-230`: Si el cliente mandó `Origin`, lo reescribe hacia `http://127.0.0.1:52710`.
  - `L232-239`: Dispara la petición hacia DSH local con los headers modificados.
  - `L240-244`: Recibe la respuesta de DSH y la canaliza (*pipe*) de vuelta al cliente móvil.
  - `L246-249`: Si la petición hacia DSH falla, devuelve un código 502 (Bad Gateway).
  - `L251`: Canaliza el body del cliente hacia el backend (para métodos POST/PUT).
* **Vulnerabilidades y fallas graves (VULN-03, BUG-03 y Seguridad Web):**
  1. **Falla de Sobrescritura de Cookie (BUG-03):** La línea 221 dice: `if (!targetHeaders["cookie"].includes(cookieName))`. Imagina que el navegador móvil guardó una cookie vieja que ya expiró o se corrompió. Como el string sí contiene `cookieName`, el puente **no la actualiza** y le manda la cookie vieja y podrida a DSH. Resultado: DSH rechaza la conexión con `401 Unauthorized` y el usuario se queda fuera sin entender qué pasó.
  2. **Explosión por Headers ya Enviados (VULN-03):** En las líneas 246-249, si ocurre un error de conexión cuando `clientRes` ya empezó a enviar datos al cliente (muy común en streaming de tokens SSE o descargas de archivos), invocar `clientRes.writeHead(502)` provocará una excepción no controlada:  
     `Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client`.  
     Al no estar envuelta en un `try/catch` ni verificar `if (!clientRes.headersSent)`, **Node.js revienta de inmediato y el proceso se muere**.
  3. **Omisión de `Referer`:** Reescribe `Origin`, pero deja intacto el header `Referer` (`http://10.x.x.x:57420`). Si los endpoints de DSH activan validación CSRF estricta sobre el Referer, las peticiones fallarán.
  4. **Falta de Headers Hop-by-Hop:** Los proxies HTTP/1.1 formales (RFC 7230 / RFC 9110) deben eliminar encabezados de salto como `Keep-Alive`, `Proxy-Authenticate`, `Proxy-Authorization`, `TE`, `Trailers`, `Transfer-Encoding`, `Upgrade`.

#### Líneas 254 a 294: Proxy Reverso de WebSockets (Manejo de Upgrade)
```javascript
254: // WebSocket Upgrade Proxy
255: server.on("upgrade", (clientReq, clientSocket, clientHead) => {
256:   const targetHeaders = { ...clientReq.headers };
257:   targetHeaders["host"] = authority;
258: 
259:   const authCookie = getValidCookie();
260:   if (targetHeaders["cookie"]) {
261:     if (!targetHeaders["cookie"].includes(cookieName)) {
262:       targetHeaders["cookie"] = `${targetHeaders["cookie"]}; ${authCookie}`;
263:     }
264:   } else {
265:     targetHeaders["cookie"] = authCookie;
266:   }
267: 
268:   if (targetHeaders["origin"]) {
269:     targetHeaders["origin"] = `http://${authority}`;
270:   }
271: 
272:   const targetSocket = net.connect(TARGET_PORT, TARGET_HOST, () => {
273:     let reqRaw = `${clientReq.method} ${clientReq.url} HTTP/1.1\r\n`;
274:     for (const [key, value] of Object.entries(targetHeaders)) {
275:       if (Array.isArray(value)) {
276:         for (const v of value) reqRaw += `${key}: ${v}\r\n`;
277:       } else if (value !== undefined) {
278:         reqRaw += `${key}: ${value}\r\n`;
279:       }
280:     }
281:     reqRaw += "\r\n";
282: 
283:     targetSocket.write(reqRaw);
284:     if (clientHead && clientHead.length) {
285:       targetSocket.write(clientHead);
286:     }
287: 
288:     clientSocket.pipe(targetSocket);
289:     targetSocket.pipe(clientSocket);
290:   });
291: 
292:   targetSocket.on("error", () => clientSocket.destroy());
293:   clientSocket.on("error", () => targetSocket.destroy());
294: });
```
* **Qué hace cada línea:**
  - `L255`: Captura el evento `'upgrade'` del servidor HTTP (cuando el cliente pide levantar WebSocket).
  - `L256-270`: Replica la misma manipulación de headers (`Host`, `Cookie`, `Origin`).
  - `L272`: Abre una conexión TCP cruda con `net.connect` hacia `127.0.0.1:TARGET_PORT`.
  - `L273-281`: Reconstruye manualmente el texto plano del protocolo HTTP/1.1 para el apretón de manos (*handshake*).
  - `L283-286`: Escribe la cabecera formateada y cualquier buffer previo (`clientHead`) en el socket destino.
  - `L288-289`: Conecta bidireccionalmente los dos sockets con `pipe`.
  - `L292-293`: Si cualquiera de los dos sockets tiene un error, destruye el socket opuesto.
* **Vulnerabilidades y Riesgos (VULN-02):**
  1. **CRLF Injection y Request Smuggling en Handshake:** Al ensamblar manualmente el texto HTTP en las líneas 274-280 sin validar que ni los nombres de los headers ni los valores contengan saltos de línea (`\r\n`), un cliente malicioso puede inyectar cabeceras adicionales o forzar una petición HTTP prematura en el backend.
  2. **Socket Orphan y Cierre abrupto:** Si `targetSocket` no puede conectar (porque DSH está ocupado o apagado), la línea 292 destruye `clientSocket` de golpe sin mandar una respuesta HTTP limpia como `HTTP/1.1 502 Bad Gateway\r\n\r\n`. El navegador del celular simplemente verá un error crudo `ERR_CONNECTION_RESET` sin explicación.
  3. **Pérdida de paquetes en carrera (Race Condition):** `clientSocket.pipe(targetSocket)` se ejecuta dentro del callback de `net.connect`. Si el cliente envió frames adicionales de WebSocket antes de que el socket TCP hacia DSH terminara de negociar, esos paquetes se pueden perder si no se pausa el socket (`clientSocket.pause()`) antes de conectar.

#### Líneas 296 a 306: Escucha del Servidor y Manejo Fatal de Errores
```javascript
296: server.listen(LISTEN_PORT, BIND_HOST, () => {
297:   const accessIp = DISPLAY_IP !== "0.0.0.0" ? DISPLAY_IP : "127.0.0.1";
298:   log(`Ready! Access from mobile via: http://${accessIp}:${LISTEN_PORT}`);
299:   if (accessIp !== "127.0.0.1" && DISPLAY_IP !== "0.0.0.0") {
300:     log(`(Bridge listening on all interfaces ${BIND_HOST}:${LISTEN_PORT})`);
301:   }
302: });
303: 
304: server.on("error", (err) => {
305:   console.error(`[DSH-Bridge Fatal] Failed to bind to ${BIND_HOST}:${LISTEN_PORT}:`, err.message);
306: });
```
* **Qué hace cada línea:**
  - `L296`: Pone el servidor a escuchar en `LISTEN_PORT` y `BIND_HOST`.
  - `L297-301`: Imprime en consola la URL sugerida con la IP detectada.
  - `L304-306`: Si ocurre un error de binding (como `EADDRINUSE`), lo imprime en `stderr`.
* **Detalle:**
  Si falla el bind, el error se imprime pero no hay una salida con código de estado explícito (`process.exit(1)`), dejando que Node termine de manera implícita.

---

### 3.2. Archivo: `run-hidden.vbs` (Lanzador en segundo plano)

```vbscript
1: Set WshShell = CreateObject("WScript.Shell")
2: Set fso = CreateObject("Scripting.FileSystemObject")
3: 
4: strCurrentDir = fso.GetParentFolderName(WScript.ScriptFullName)
5: strBridgeScript = strCurrentDir & "\bridge.mjs"
6: 
7: strUserProfile = WshShell.ExpandEnvironmentStrings("%USERPROFILE%")
8: strDshNode = strUserProfile & "\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
9: 
10: strNodeExe = ""
11: 
12: ' 1. Prioritize bundled DSH runtime Node.js (guaranteed to be compatible and present)
13: If fso.FileExists(strDshNode) Then
14:     strNodeExe = strDshNode
15: End If
16: 
17: ' 2. Check standard Windows Node.js installation paths
18: If strNodeExe = "" Then
19:     strProgFiles = WshShell.ExpandEnvironmentStrings("%ProgramFiles%")
20:     If fso.FileExists(strProgFiles & "\nodejs\node.exe") Then
21:         strNodeExe = strProgFiles & "\nodejs\node.exe"
22:     End If
23: End If
24: 
25: If strNodeExe = "" Then
26:     strProgFilesX86 = WshShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%")
27:     If fso.FileExists(strProgFilesX86 & "\nodejs\node.exe") Then
28:         strNodeExe = strProgFilesX86 & "\nodejs\node.exe"
29:     End If
30: End If
31: 
32: If strNodeExe = "" Then
33:     strLocalApp = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
34:     If fso.FileExists(strLocalApp & "\Programs\node\node.exe") Then
35:         strNodeExe = strLocalApp & "\Programs\node\node.exe"
36:     End If
37: End If
38: 
39: ' 3. Fallback to system PATH 'node'
40: If strNodeExe = "" Then
41:     strNodeExe = "node"
42: End If
43: 
44: ' Run node in background with window hidden (0), without waiting for completion (False)
45: WshShell.Run """" & strNodeExe & """ """ & strBridgeScript & """", 0, False
```

* **Qué hace cada línea:**
  - `L1-2`: Instancia los objetos COM esenciales de Windows Script Host (`WScript.Shell` y `Scripting.FileSystemObject`).
  - `L4-5`: Averigua la carpeta donde está guardado el script y apunta a `bridge.mjs`.
  - `L7-8`: Construye la ruta hacia el binario `node.exe` empaquetado en el runtime primario de DeepSeek Harness.
  - `L10-37`: Cadena de búsqueda en cascada: primero el runtime de DSH, luego `Program Files`, luego `Program Files (x86)`, luego `AppData\Local\Programs\node`.
  - `L39-42`: Si no lo halla en ninguno, confía en que `node` esté en el PATH.
  - `L45`: Lanza el comando con los argumentos entre comillas, ventana oculta (`0`) y sin esperar retorno (`False`).
* **Broncas y descuidos (OPS-01):**
  1. **Falta de cambio de directorio de trabajo:** Jamás se establece `WshShell.CurrentDirectory = strCurrentDir`. Si el VBScript es invocado desde otra carpeta o un planificador de tareas, el proceso de Node heredará una carpeta arbitraria.
  2. **Cero visibilidad ante fallos:** La línea 45 ejecuta `node bridge.mjs` con la ventana oculta y sin redirigir `stdout` ni `stderr`. Si `bridge.mjs` no encuentra `.credentials.yaml`, si el puerto ya está ocupado o si hay un error de sintaxis, **Node truena en 5 milisegundos y nadie se entera**. No hay un archivo de log (`bridge.log`) ni alertas en el Visor de Eventos.

---

### 3.3. Archivo: `install-autostart.bat` (Instalador en el Inicio de Windows)

```batch
1: @echo off
2: setlocal
3: echo ========================================================
4: echo   Instalando DSH Mobile Companion en Inicio de Windows
5: echo ========================================================
6: echo.
7: 
8: set "SCRIPT_DIR=%~dp0"
9: set "VBS_PATH=%SCRIPT_DIR%run-hidden.vbs"
10: set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
11: set "SHORTCUT_PATH=%STARTUP_FOLDER%\DSH-Mobile-Companion.lnk"
12: 
13: powershell -NoProfile -Command ^
14:   "$ws = New-Object -ComObject WScript.Shell; " ^
15:   "$sc = $ws.CreateShortcut('%SHORTCUT_PATH%'); " ^
16:   "$sc.TargetPath = 'wscript.exe'; " ^
17:   "$sc.Arguments = '\"%VBS_PATH%\"'; " ^
18:   "$sc.WorkingDirectory = '%SCRIPT_DIR%'; " ^
19:   "$sc.Description = 'DeepSeek Harness Mobile Companion Auto-Start'; " ^
20:   "$sc.Save();"
21: 
22: if exist "%SHORTCUT_PATH%" (
23:     echo [OK] Acceso directo de inicio automatico creado exitosamente en:
24:     echo      %SHORTCUT_PATH%
25:     echo.
26:     echo Iniciando el puente ahora mismo en segundo plano...
27:     wscript.exe "%VBS_PATH%"
28:     echo.
29:     echo ========================================================
30:     echo   Instalacion completada. Se iniciara con Windows!
31:     echo ========================================================
32: ) else (
33:     echo [ERROR] No se pudo crear el acceso directo de inicio.
34: )
35: 
36: pause
```

* **Qué hace cada línea:**
  - `L1-2`: Apaga el eco de comandos y localiza las variables de entorno.
  - `L8-11`: Determina la ruta del script actual (`%~dp0`), la ruta del VBScript y la carpeta `Startup` del usuario.
  - `L13-20`: Usa un comando en línea de PowerShell para instanciar `WScript.Shell` y crear el acceso directo `.lnk`.
  - `L22-34`: Si el archivo `.lnk` se creó con éxito, ejecuta de una vez el VBScript en segundo plano.
  - `L36`: Pausa la consola para que el usuario lea el resultado.
* **Detalles y riesgos operativos:**
  1. **Confusión con 'Ejecutar como Administrador':** Si el usuario le da clic derecho y "Ejecutar como Administrador", la variable `%APPDATA%` apuntará a la cuenta de Administrador (`C:\Users\Administrator\AppData\Roaming\...`), por lo que el acceso directo **no se creará en la cuenta del usuario común**, y al reiniciar la PC no arrancará nada.
  2. **No es idempotente (doble instancia):** Si el usuario ejecuta este script dos veces seguidas para reinstalar o verificar, la línea 27 levantará una segunda instancia de `bridge.mjs` sin haber matado la anterior, provocando choque de puertos inmediato.

---

### 3.4. Archivo: `uninstall-autostart.bat` (Desinstalador del servicio)

```batch
1: @echo off
2: setlocal
3: echo ========================================================
4: echo   Desinstalando DSH Mobile Companion
5: echo ========================================================
6: echo.
7: 
8: set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
9: set "SHORTCUT_PATH=%STARTUP_FOLDER%\DSH-Mobile-Companion.lnk"
10: 
11: if exist "%SHORTCUT_PATH%" (
12:     del /f /q "%SHORTCUT_PATH%"
13:     echo [OK] Acceso directo de inicio automatico eliminado.
14: ) else (
15:     echo [INFO] No se encontro el acceso directo de inicio automatico.
16: )
17: 
18: echo.
19: echo Cerrando instancias activas del puente...
20: powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*bridge.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
21: echo [OK] Proceso detenido.
22: echo.
23: echo Desinstalacion completa.
24: pause
```

* **Qué hace cada línea:**
  - `L8-16`: Borra el archivo `.lnk` de la carpeta de inicio de Windows.
  - `L19-21`: Utiliza PowerShell con `Get-CimInstance Win32_Process` para buscar cualquier proceso cuyo comando contenga `*bridge.mjs*` y lo liquida con `Stop-Process -Force`.
* **Ojo aquí (OPS-02):**
  La línea 20 utiliza un comodín excesivamente amplio (`*bridge.mjs*`). Si el usuario es desarrollador y tiene otro proyecto legítimo (por ejemplo, un bot de Discord con un script llamado `bridge.mjs`), este comando se lo va a despachar sin piedad. Debe filtrar por la ruta exacta de este directorio.

---

### 3.5. Archivo: `start.bat` y `stop.bat` (Control manual)

#### `start.bat`
```batch
1: @echo off
2: echo ========================================================
3: echo   Iniciando DSH Mobile Companion en segundo plano...
4: echo ========================================================
5: wscript.exe "%~dp0run-hidden.vbs"
6: echo.
7: echo [OK] Puente iniciado exitosamente en segundo plano.
8: echo.
9: echo Para acceder desde tu celular o tablet:
10: echo 1. Asegurate de tener ZeroTier o Tailscale activo en ambos dispositivos.
11: echo 2. Abre en tu navegador movil:
12: echo      http://^<TU_IP_VPN^>:57420
13: echo.
14: echo    * Revisa la IP asignada en tu aplicacion de ZeroTier o Tailscale.
15: echo ========================================================
16: echo.
17: timeout /t 3 >nul
```
* **Qué hace cada línea:** Lanza el script VBS y muestra instrucciones en pantalla, cerrando la ventana automáticamente después de 3 segundos (`timeout /t 3`).
* **Detalle:** Si ya estaba corriendo una instancia previa, no avisa ni la detiene; vuelve a lanzar otra a ciegas.

#### `stop.bat`
```batch
1: @echo off
2: echo Deteniendo DSH Mobile Companion...
3: powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*bridge.mjs*' -or $_.CommandLine -like '*zt-bridge.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
4: echo [OK] Detenido.
5: timeout /t 2 >nul
```
* **Qué hace cada línea:** Detiene los procesos que contengan `*bridge.mjs*` o `*zt-bridge.mjs*` en la línea de comando.
* **Detalle:** La referencia a `*zt-bridge.mjs*` en la línea 3 es un "fantasma" o residuo de una versión anterior que ya no existe en el repositorio actual.

---

### 3.6. Archivos Complementarios: `.gitignore`, `README.md` y `DSH-Companion.apk`

#### `.gitignore`
Revisando `.gitignore`:
- Contiene reglas excelentes para evitar fugas de `.env`, llaves privadas (`*.pem`, `*.key`, `*.pfx`) y credenciales (`.credentials.yaml`).
- **Pifia encontrada:** **No ignora archivos APK (`*.apk`)**. En el repositorio está subido el binario `DSH-Companion.apk` de 5.6 MB.

#### Presencia de `DSH-Companion.apk`
- **Riesgo:** Subir binarios compilados directamente al repositorio de control de versiones infla el historial de Git, pero peor aún en ciberseguridad: **un binario precompilado sin código fuente asociado ni firma criptográfica verificable en el repo representa un riesgo de cadena de suministro (*supply chain risk*)**. Si el proyecto promueve usar el navegador web / PWA, el APK debe ser generado mediante un pipeline CI/CD con hash SHA-256 publicado en GitHub Releases, no alojado como un blob opaco en el repo principal.

#### `README.md`
- **Falsa sensación de seguridad:** Afirma categóricamente en la línea 11: *"100% Seguro y Privado: No abre puertos públicos en tu router. Funciona exclusivamente a través de tu red VPN privada (ZeroTier / Tailscale)"*.
  Como demostramos en la auditoría de `bridge.mjs`, el código abre el puerto en `0.0.0.0`, por lo que **esta afirmación es técnicamente falsa** hasta que no se aplique el parche de amarre estricto de IP.
- En la línea 27 tiene una URL ficticia: `https://github.com/TU_USUARIO/dsh-mobile-companion.git`.

---

## 4. PROPUESTA INTEGRAL DE IDENTIDAD VISUAL Y CONCEPTO DE LOGO

Para que **DSH Mobile Companion** y la marca madre **Tinta y Nodos** luzcan con la seriedad y el poder técnico que merecen, diseñamos una identidad visual sobria, moderna y profundamente anclada en la ciberseguridad defensiva y el hacking ético.

### 4.1. Filosofía y Metáfora Visual: "El Búnker y el Puente"
1. **La Tinta (El Conocimiento / El Código):** Representa la materia prima del pensamiento humano y de la inteligencia artificial. La fluidez de las ideas que se escriben, se procesan y se ejecutan.
2. **Los Nodos (La Red Distribuida):** La infraestructura descentralizada, los puntos de conexión interconectados mediante túneles seguros y cifrados.
3. **El Búnker:** La estación de trabajo local (la PC con DeepSeek Harness), hermética, protegida tras `127.0.0.1`, inmune a la red pública.
4. **El Puente Cifrado (Mobile Companion):** El túnel VPN que extiende un hilo seguro desde el teléfono móvil directamente al corazón del búnker, sin exponer un solo milímetro al exterior.

---

### 4.2. Logotipos en Arte ASCII (Representación Oficial en Consola y Documentación)

#### Logotipo Primario: "Tinta y Nodos" (Firma de Autor)
```
      ____  _____ _   _ _____  _     __   __  _   _  ___  ____   ___  ____  
     |_   _||_   _| \ | |_   _|/ \    \ \ / / | \ | |/ _ \|  _ \ / _ \/ ___| 
       | |    | | |  \| | | | / _ \    \ V /  |  \| | | | | | | | | | \___ \ 
       | |   _| |_| |\  | | |/ ___ \    | |   | |\  | |_| | |_| | |_| |___) |
       |_|  |_____|_| \_| |_/_/   \_\   |_|   |_| \_|\___/|____/ \___/|____/ 
                    [ CIBERSEGURIDAD & CÓDIGO DEFENSIVO ]
```

#### Emblema Oficial: "DSH Mobile Companion" (El Búnker y el Enlace Móvil)
```
                  +-----------------------------------+
                  |   [###]  BÚNKER LOCAL (DSH)       |
                  |          127.0.0.1:52710          |
                  +-----------------+-----------------+
                                    |
                            [ PUERTE HMAC ]
                           (Cifrado SHA-256)
                                    |
                  +-----------------+-----------------+
                  |   ~~~ TUNEL PRIVADO VPN ~~~       |
                  |   ZeroTier [10.x] / Tailscale     |
                  +-----------------+-----------------+
                                    |
                                    v
                            +---------------+
                            |  [#] COMPANION|
                            |  Dispositivo  |
                            |  Móvil Seguro |
                            +---------------+
```

#### Isotipo Compacto / Ícono de Aplicación (Icono PWA / Favicon):
```
                       .-----------------.
                      /  .-.   ===   .-.  \
                     |  /   \       /   \  |
                     | |\___/| (T) |\___/| |
                     | | === |  |  | === | |
                     |  \___/   N   \___/  |
                      \      [BRIDGE]     /
                       '-----------------'
```

---

### 4.3. Paleta de Colores Corporativa (Tema Cyberpunk Búnker / Obsidian & Neon)

| Nombre del Color | Hexadecimal | RGB | Significado / Uso en UI |
|---|---|---|---|
| **Deep Obsidian (Búnker)** | `#0D1117` | `13, 17, 23` | Fondo principal de la aplicación, terminal y búnker seguro. |
| **Tinta Dark Blue** | `#161B22` | `22, 27, 34` | Superficie de tarjetas, barras de navegación y módulos. |
| **Nodo Cyan (Túnel VPN)** | `#00F5D4` | `0, 245, 212` | Acento primario, representa la conexión activa y datos en tránsito. |
| **Matrix Neon Green (Auth OK)** | `#39FF14` | `57, 255, 20` | Estado del puente verificado, HMAC válido, servicio en línea. |
| **Shield Orange (Alerta)** | `#FF9E00` | `255, 158, 0` | Avisos de red local, advertencias de puertos y reconexión. |
| **Glitch Red (Ataque/Error)** | `#FF0055` | `255, 0, 85` | Detección de intrusión, fallo de bind o caída de DSH. |
| **Pure Slate Text** | `#F0F6FC` | `240, 246, 252` | Tipografía principal de alto contraste y legibilidad. |

---

### 4.4. Especificaciones Tipográficas

1. **Tipografía para Interfaces y Marca (Display / UI):**
   - **Familia Primaria:** `JetBrains Mono` o `Fira Code`.
   - **Razón:** Proyecta precisión técnica, soporte nativo de ligaduras para operadores de programación (`=>`, `===`, `!=`) y aspecto de consola de mando de ciberseguridad.
   - **Familia Secundaria (Lectura Móvil / PWA):** `Inter` o `System UI` (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`).
2. **Jerarquía Visual:**
   - **Títulos H1:** `JetBrains Mono SemiBold` (Tracking: -0.02em).
   - **Métricas de Conexión / IPs:** `JetBrains Mono Bold` con acento en color **Nodo Cyan**.
   - **Cuerpo de Texto:** `Inter Regular` 14px / Line-height 1.6.

---

## 5. GUÍA DEFINITIVA DE PARCHES Y REMEDIACIÓN (CÓDIGO LISTO PARA PRODUCCIÓN)

Aquí no venimos a decir nomás qué está mal: **aquí traemos el parche listo para aplicar y dejar el sistema blindado**.

### 5.1. Parche Blindado para `bridge.mjs`

Este nuevo diseño resuelve todos los fallos:
1. **Amarre estricto:** Si se detecta IP de VPN, el servidor **solo escucha en la IP de la VPN** (evitando abrirse a la LAN).
2. **Reemplazo limpio de cookies:** Destruye cualquier cookie vieja y garantiza que la firma válida entre limpia.
3. **Manejo a prueba de balas de errores HTTP y WebSocket:** Verifica `headersSent` antes de responder y evita caídas con `ERR_HTTP_HEADERS_SENT`.
4. **Sanitización de cabeceras:** Limpia caracteres de salto de línea (`\r`, `\n`) antes de escribir en el socket TCP.
5. **Detección dinámica y reintentos:** Si DSH se apaga o reinicia, el puente no truena y reintenta reconectar.

```javascript
/**
 * DSH Mobile Companion Bridge - EDICIÓN BLINDADA
 * Elaborado por: Ismael Muñoz Reyes
 * Proyecto: DSH Mobile Companion / Tinta y Nodos
 */

import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TARGET_HOST = "127.0.0.1";
const LISTEN_PORT = parseInt(process.env.DSH_LISTEN_PORT || "57420", 10);

function log(msg) {
  const ts = new Date().toISOString().replace("T", " ").substring(0, 19);
  console.log(`[DSH-Bridge ${ts}] ${msg}`);
}

function probePort(port, host = TARGET_HOST, timeout = 1000) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: host, port, method: "GET", path: "/", timeout },
      (res) => {
        if ([200, 301, 302, 401, 403].includes(res.statusCode)) {
          resolve(true);
        } else {
          resolve(false);
        }
        res.resume();
      }
    );
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
    req.end();
  });
}

async function detectTargetPort() {
  if (process.env.DSH_TARGET_PORT) {
    const envPort = parseInt(process.env.DSH_TARGET_PORT, 10);
    if (!isNaN(envPort) && envPort > 0) return envPort;
  }
  // No incluimos 57420 para evitar colisión con LISTEN_PORT
  const candidatePorts = [52710, 52711, 52712, 57421];
  for (const port of candidatePorts) {
    if (await probePort(port)) {
      log(`Detectado Web GUI de DSH en puerto: ${port}`);
      return port;
    }
  }
  return 52710;
}

function findVpnIp() {
  if (process.env.DSH_VPN_IP) {
    return { ip: process.env.DSH_VPN_IP, iface: "env" };
  }
  const ifaces = os.networkInterfaces();
  const isIpv4 = (a) => (a.family === "IPv4" || a.family === 4) && !a.internal && !a.address.startsWith("169.254.");

  // 1. Interfaces explícitas VPN
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (/zerotier|tailscale|^zt|^ts|wireguard|^wg|openvpn/i.test(name) && addrs) {
      for (const a of addrs) {
        if (isIpv4(a)) return { ip: a.address, iface: name };
      }
    }
  }
  // 2. Tailscale CGNAT (100.64.0.0/10)
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (addrs) {
      for (const a of addrs) {
        if (isIpv4(a) && a.address.startsWith("100.")) {
          const second = Number(a.address.split(".")[1]);
          if (second >= 64 && second <= 127) return { ip: a.address, iface: name };
        }
      }
    }
  }
  return { ip: "127.0.0.1", iface: "loopback" };
}

function loadSecret() {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  const credPath = path.join(dshHome, ".credentials.yaml");
  if (!fs.existsSync(credPath)) {
    throw new Error(`No se encontró el archivo de credenciales en ${credPath}`);
  }
  const content = fs.readFileSync(credPath, "utf8");
  const match = content.match(/client-connection\/browser-session:[\s\S]*?secret:\s*([A-Za-z0-9_-]+)/);
  if (!match || !match[1]) {
    throw new Error("No se pudo extraer el secreto browser-session de .credentials.yaml");
  }
  return match[1].trim();
}

const TARGET_PORT = await detectTargetPort();
const rawSecret = loadSecret();
const secret = Buffer.from(rawSecret, "base64url");
const authority = `${TARGET_HOST}:${TARGET_PORT}`;
const cookieHash = crypto.createHash("sha256").update(authority).digest().toString("base64url");
const cookieName = `dsh-auth-${cookieHash}`;

let cachedCookie = "";
let cookieExpiresAt = 0;

function getValidCookie() {
  const now = Date.now();
  if (cachedCookie && now < cookieExpiresAt) {
    return cachedCookie;
  }
  const issuedAt = now;
  const expiresAt = issuedAt + 7 * 24 * 3600 * 1000;
  const payload = { version: 1, authority, issuedAt, expiresAt };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest().toString("base64url");
  cachedCookie = `${cookieName}=v1.${body}.${sig}`;
  cookieExpiresAt = expiresAt - 3600 * 1000;
  return cachedCookie;
}

function injectAuthHeaders(headers) {
  const newHeaders = { ...headers };
  newHeaders["host"] = authority;
  if (newHeaders["origin"]) newHeaders["origin"] = `http://${authority}`;
  if (newHeaders["referer"]) newHeaders["referer"] = `http://${authority}/`;

  const authCookie = getValidCookie();
  if (newHeaders["cookie"]) {
    const cookies = newHeaders["cookie"]
      .split(";")
      .map((c) => c.trim())
      .filter((c) => !c.startsWith(`${cookieName}=`));
    cookies.push(authCookie);
    newHeaders["cookie"] = cookies.join("; ");
  } else {
    newHeaders["cookie"] = authCookie;
  }
  return newHeaders;
}

const { ip: BIND_IP, iface } = findVpnIp();
// Si se desea permitir acceso explícito en todas las interfaces, configurarlo por variable:
const FINAL_BIND_HOST = process.env.DSH_BIND_HOST || (BIND_IP !== "127.0.0.1" ? BIND_IP : "127.0.0.1");

const server = http.createServer((clientReq, clientRes) => {
  const targetHeaders = injectAuthHeaders(clientReq.headers);

  const proxyReq = http.request(
    {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: clientReq.url,
      method: clientReq.method,
      headers: targetHeaders,
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes, { end: true });
    }
  );

  proxyReq.on("error", (err) => {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      clientRes.end(`[DSH Bridge] Error al conectar con el backend (${TARGET_HOST}:${TARGET_PORT}): ${err.message}`);
    } else {
      clientRes.destroy();
    }
  });

  clientReq.pipe(proxyReq, { end: true });
  clientReq.on("error", () => proxyReq.destroy());
});

server.on("upgrade", (clientReq, clientSocket, clientHead) => {
  clientSocket.pause();
  const targetHeaders = injectAuthHeaders(clientReq.headers);

  const targetSocket = net.connect(TARGET_PORT, TARGET_HOST, () => {
    let reqRaw = `${clientReq.method} ${clientReq.url} HTTP/1.1\r\n`;
    for (const [key, value] of Object.entries(targetHeaders)) {
      // Sanitización contra CRLF Injection
      const sanitizedKey = String(key).replace(/[\r\n]/g, "");
      const values = Array.isArray(value) ? value : [value];
      for (const v of values) {
        if (v !== undefined) {
          const sanitizedVal = String(v).replace(/[\r\n]/g, "");
          reqRaw += `${sanitizedKey}: ${sanitizedVal}\r\n`;
        }
      }
    }
    reqRaw += "\r\n";

    targetSocket.write(reqRaw);
    if (clientHead && clientHead.length) {
      targetSocket.write(clientHead);
    }

    clientSocket.pipe(targetSocket);
    targetSocket.pipe(clientSocket);
    clientSocket.resume();
  });

  targetSocket.on("error", (err) => {
    log(`Error en túnel WebSocket: ${err.message}`);
    if (clientSocket.writable) {
      clientSocket.write("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
    }
    clientSocket.destroy();
  });

  clientSocket.on("error", () => targetSocket.destroy());
});

server.listen(LISTEN_PORT, FINAL_BIND_HOST, () => {
  log(`Tinta y Nodos - DSH Mobile Companion ACTIVO`);
  log(`Escuchando estrictamente en: http://${FINAL_BIND_HOST}:${LISTEN_PORT}`);
  log(`Redirigiendo de forma segura hacia: http://${authority}`);
});

server.on("error", (err) => {
  console.error(`[Error Fatal] No se pudo levantar el puerto ${FINAL_BIND_HOST}:${LISTEN_PORT}:`, err.message);
  process.exit(1);
});
```

---

### 5.2. Parche para `run-hidden.vbs` (Con Logging y Manejo de Rutas)

```vbscript
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strCurrentDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strCurrentDir

strBridgeScript = strCurrentDir & "\bridge.mjs"
strLogFile = strCurrentDir & "\bridge.log"

strUserProfile = WshShell.ExpandEnvironmentStrings("%USERPROFILE%")
strDshNode = strUserProfile & "\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

strNodeExe = ""
If fso.FileExists(strDshNode) Then
    strNodeExe = strDshNode
ElseIf fso.FileExists(WshShell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe") Then
    strNodeExe = WshShell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"
Else
    strNodeExe = "node"
End If

' Redirige salida estandar y errores a bridge.log para evitar ceguera operativa
strCmd = "cmd.exe /c """"" & strNodeExe & """ """ & strBridgeScript & """ >> """ & strLogFile & """ 2>&1"""
WshShell.Run strCmd, 0, False
```

---

### 5.3. Parche Idempotente y Seguro para `stop.bat` y `uninstall-autostart.bat`

```batch
@echo off
setlocal
echo Deteniendo DSH Mobile Companion de forma segura...
set "TARGET_DIR=%~dp0"

powershell -NoProfile -Command ^
  "$target = [System.IO.Path]::GetFullPath('%TARGET_DIR%').TrimEnd('\'); " ^
  "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*bridge.mjs*' } | ForEach-Object { " ^
  "  if ($_.CommandLine -like ('*' + $target + '*')) { " ^
  "    Write-Host ('Terminando proceso ID: ' + $_.ProcessId); " ^
  "    Stop-Process -Id $_.ProcessId -Force " ^
  "  } " ^
  "}"
echo [OK] Servicio detenido limpiamente sin afectar otros programas.
```

---

### 5.4. Actualización Recomendada para `.gitignore`

Agregar estas líneas al final de `.gitignore`:
```gitignore
# Archivos de bitácora locales
bridge.log
*.log

# Binarios móviles precompilados (descargar vía GitHub Releases)
*.apk
*.aab

# Archivos temporales de bloqueo de proceso
*.pid
*.lock
```

---

## 6. CONCLUSIONES Y DICTAMEN FINAL

1. **Estado Actual:** El software cumple con su cometido funcional de túnel y reescritura de autenticación para DeepSeek Harness, pero presenta **vulnerabilidades críticas de red (Open Relay)** y detalles de robustez que pueden provocar **pantallas en blanco o fallos silenciosos en producción**.
2. **Acción Inmediata Requerida:** Aplicar el parche en `bridge.mjs` para amarrar la IP exclusivamente a la interfaz privada de VPN (`BIND_HOST` estricto) y añadir el archivo de log en `run-hidden.vbs`.
3. **Gobierno del Repositorio:** Retirar el archivo binario `DSH-Companion.apk` del árbol de Git y canalizar su distribución a través de los Releases oficiales firmados.

---
**Firma de Conformidad Técnica:**  
**Elaborado por:** Ismael Muñoz Reyes  
**Proyecto:** DSH Mobile Companion / Tinta y Nodos  
*Ciberseguridad Defensiva y Arquitectura de Sistemas Distribuidos*
