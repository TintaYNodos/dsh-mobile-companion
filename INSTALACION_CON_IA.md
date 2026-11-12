# GUÍA DE INSTALACIÓN Y CONFIGURACIÓN AUTOMATIZADA CON IA

> **Para el usuario:** Si utilizas un asistente o agente de inteligencia artificial con acceso a terminal o ejecución de comandos (por ejemplo: DeepSeek Harness, Cursor, Claude Code, Copilot, Windsurf o similares), copia y pega el siguiente bloque de instrucciones en el chat con tu agente. La IA se encargará de instalar, activar, verificar y dejar listo todo el sistema en tu computadora sin que tengas que realizar pasos manuales complejos.

---

## 📋 PROMPT PARA TU ASISTENTE DE IA

*Copia todo el bloque delimitado a continuación y pégalo directamente en la conversación con tu agente:*

```text
Actúa como especialista de configuración técnica en este equipo.
Tu misión es instalar, activar, verificar y dejar completamente configurado el sistema "DSH Mobile Companion" (puente seguro de acceso móvil para DeepSeek Harness a través de red privada ZeroTier o Tailscale), y entregarme al final las instrucciones sencillas para conectar mi teléfono móvil.

Realiza los siguientes pasos de forma ordenada y autónoma:

1. INSPECCIÓN DEL ENTORNO Y HERRAMIENTAS:
   - Verifica la presencia de DeepSeek Harness en este equipo revisando la carpeta "%USERPROFILE%\.dsh".
   - Localiza el ejecutable de Node.js. Si no está en el PATH global de Windows, utiliza el motor empaquetado de DeepSeek Harness ubicado en:
     "%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
   - Identifica la dirección IP de red privada (ZeroTier en rango 10.x.x.x o Tailscale en rango 100.x.x.x). Si la VPN no está activa todavía, anota que se requiere encenderla, pero continúa con la configuración local.

2. OBTENCIÓN Y PREPARACIÓN DE ARCHIVOS:
   - Si no estás dentro del repositorio o la carpeta "dsh-mobile-companion" no existe en la ubicación de trabajo actual, descárgala clonando el repositorio oficial:
     git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
   - Si ya estás dentro de la carpeta o ya fue clonada, úsala como directorio base.

3. ACTIVACIÓN E INICIO AUTOMÁTICO EN SEGUNDO PLANO:
   - Configura el inicio automático con Windows ejecutando el script "install-autostart.bat" o creando el acceso directo a "run-hidden.vbs" dentro de la carpeta de inicio de Windows:
     "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DSH-Mobile-Companion.lnk"
   - Inicia el servicio en segundo plano ejecutando de inmediato "run-hidden.vbs". El proceso debe correr silenciosamente sin dejar ventanas de consola abiertas.

4. PRUEBA DE CONECTIVIDAD Y ESTADO:
   - Realiza una consulta HTTP GET a:
     http://127.0.0.1:57420/dsh-companion/status
   - Confirma que responda código 200 y formato JSON.
   - Inspecciona los valores "service", "version" y "dshOnline" para saber si DeepSeek Harness está abierto en la computadora en este momento.

5. REPORTE FINAL Y RECOMENDACIONES PARA EL USUARIO (EN LENGUAJE CLARO Y DIRECTO):
   Al finalizar, redacta un mensaje final sin jerga técnica que me indique exactamente:
   a) La dirección web exacta que debo abrir en el navegador de mi teléfono (ejemplo: http://10.x.x.x:57420).
   b) El enlace para descargar la aplicación nativa para Android desde GitHub Releases:
      https://github.com/TintaYNodos/dsh-mobile-companion/releases
   c) El paso de autorización de un solo clic: indicarme que debo abrir en la computadora la dirección local "http://127.0.0.1:57420/pair" y pulsar el botón "Autorizar" cuando mi teléfono aparezca por primera vez.
   d) Un recordatorio amigable de tener encendida la VPN (ZeroTier o Tailscale) en la computadora y en el teléfono al momento de usarlo.
```

---

## 🛠️ ¿Qué hace este procedimiento tras bambalinas?

1. **Reutiliza recursos locales:** Aprovecha el motor de ejecución nativo que DeepSeek Harness ya tiene instalado en Windows, sin obligar al usuario a instalar entornos pesados ni paquetes adicionales.
2. **Sin puertos públicos:** El puente se enlaza exclusivamente a la dirección IP privada de la red virtual del usuario, manteniendo el equipo aislado de redes públicas o locales compartidas.
3. **Persistencia limpia:** Crea un acceso directo estándar en la carpeta de Inicio de Windows que invoca un ejecutable VBS silencioso (`run-hidden.vbs`), garantizando que el servicio esté disponible en cada encendido sin estorbar la pantalla.
4. **Autorización sin contraseñas repetitivas:** Permite emparejar el teléfono mediante confirmación local en el navegador de la PC una sola vez cada 30 días renovables con el uso diario.
