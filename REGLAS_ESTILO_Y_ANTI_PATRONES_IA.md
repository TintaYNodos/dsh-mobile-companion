# REGLAS DE ORO DE ESCRITURA Y CÓDIGO - PROTOCOLO ANTI-PATRONES DE IA
> **Directiva Operativa de Estilo y Programación para Tinta y Nodos**
> *Objetivo:* Eliminar de raíz cualquier rastro, cliché o muletilla que delate la autoría de un modelo de lenguaje en textos, narrativa y código fuente.

---

## 🧠 PARTE 1: EN TEXTO Y REDACCIÓN (Cero clichés de LLM)

### 🚫 1. Palabras y Muletillas Prohibidas
Quedan estrictamente vetadas las palabras canónicas que los LLMs repiten hasta el cansancio:
- **Prohibidas:** *"En resumen", "En conclusión", "Es crucial recordar", "Es importante destacar", "Un tapiz de...", "Navegar por las complejidades", "Sinfonía", "Testamento de...", "Piedra angular", "Juego de niños", "Faros de esperanza", "Bucear en", "Desvelar", "Profundizar".*
- **Regla:** Ve directo al grano. Si algo es importante, se demuestra con el argumento o el dato, no anunciando que es importante.

### 🚫 2. La Estructura "Sándwich de Complacencia"
- **El vicio de la IA:** Empezar con *"¡Por supuesto! Estaré encantado de ayudarte con..."* y terminar con *"Espero que esto te sea de gran utilidad. Si tienes más dudas, avísame."*
- **Nuestra regla:** Cero rellenos corporativos o adulaciones de servicio al cliente. El contenido empieza en el primer párrafo y termina en la última idea útil.

### 🚫 3. Simetría Excesiva y "Efecto Catálogo"
- **El vicio de la IA:** Convertir cualquier explicación en una lista numerada de 5 puntos, cada uno con un título en negrita y exactamente dos oraciones balanceadas.
- **Nuestra regla:** Variedad de ritmo y longitud de párrafos. Estilo orgánico, prosa real. Combina oraciones cortas y contundentes con oraciones explicativas.

### 🚫 4. Tono Blando y Falsa Neutralidad
- **El vicio de la IA:** Usar frases tibias como *"Por un lado esto, pero por otro lado lo otro, por lo que ambas posturas son válidas"*.
- **Nuestra regla:** Postura técnica clara, pragmática, humana y resolutiva.

---

## 💻 PARTE 2: EN CÓDIGO FUENTE (Cero código de libro de texto)

### 🚫 1. Comentarios Hiper-Didácticos y Obvios
- **El vicio de la IA:**
  ```javascript
  // Iterar sobre el arreglo de usuarios
  for (const user of users) { ... }
  // Verificar si el usuario existe
  if (!user) return null;
  ```
- **Nuestra regla:** El código limpio se auto-explica. Los comentarios solo existen para explicar **el porqué de decisiones de negocio raras o casos borde no evidentes**, nunca para narrar la sintaxis elemental del lenguaje.

### 🚫 2. Snippets Anacrónicos de StackOverflow
- **El vicio de la IA:** Regurgitar código pre-2018 (polyfills manuales de Base64, wrappers innecesarios de promesas, concatenación arcaica) ignorando las APIs modernas del runtime en uso (Node.js moderno, ECMAScript moderno, PowerShell nativo).
- **Nuestra regla:** Usar APIs nativas, limpias y contemporáneas del runtime objetivo.

### 🚫 3. Código Defensivo Teatral vs. Vulnerabilidad Real
- **El vicio de la IA:** Escribir 10 bloques `try/catch` para cosas que nunca van a fallar o validar 5 veces si una variable es nula, pero ignorar por completo el vector de ataque real (como escuchar en `0.0.0.0`, no filtrar `\r\n` o no checar `headersSent`).
- **Nuestra regla:** Seguridad defensiva enfocada en arquitectura y vectores reales (interfaces de red, sanitización de entrada cruda, control de ciclo de vida de streams), no en paranoia cosmética de sintaxis.

### 🚫 4. Nombres de Variables de Tutorial
- **El vicio de la IA:** `myArray`, `dataObject`, `tempResult`, `itemElement`, `processedData`.
- **Nuestra regla:** Nombres precisos, concisos y contextuales al dominio del sistema (`targetHeaders`, `authCookie`, `vpnIface`).

### 🚫 5. Cumplimiento Literal Desconectado del Contexto
- **El vicio de la IA:** Si el prompt pide *"detecta la IP de la VPN y muéstrala"*, la IA escribe una función brillante para detectarla y luego imprime un `console.log`, pero deja el servidor en `0.0.0.0` porque no "pensó" en el objetivo integral de seguridad.
- **Nuestra regla:** Todo bloque de código debe tener sentido con el propósito final del sistema (si detectamos la IP de la VPN es para *amarrar el socket ahí*, no para adorno).
