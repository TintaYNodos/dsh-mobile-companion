# Guía de Contribución y Términos Comunitarios (CONTRIBUTING)

> **Proyecto:** DSH Mobile Companion  
> **Titularidad y Copyright:** Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.  
> **Licenciamiento:** BSL 1.1 (Business Source License) / PolyForm Noncommercial 1.0.0 Dual Framework.

Agradecemos profundamente el interés de la comunidad internacional de desarrolladores en mejorar, auditar y traducir DSH Mobile Companion. Para garantizar la seguridad del código, la calidad de ingeniería y la protección jurídica de todos los participantes, toda contribución debe regirse por los siguientes términos:

---

## 1. Términos de Licenciamiento de Entrada (Inbound Licensing)

Al enviar un *Pull Request* (PR), parche de código, propuesta de documentación o corrección de idioma a este repositorio:
1. **Cesión de licencia recíproca:** Aceptas de forma irrevocable que tus aportaciones quedan licenciadas bajo los términos idénticos de la **BSL 1.1 / PolyForm Noncommercial 1.0.0** estipulados en el archivo [LICENSE](LICENSE).
2. **Derechos concedidos al mantenedor:** Concedes a **Ismael Muñoz Reyes / Tinta y Nodos** un derecho no exclusivo, perpetuo, mundial, transferible y libre de regalías para compilar, distribuir, modificar, empaquetar y versionar tu contribución como parte de DSH Mobile Companion.
3. **Garantía de autoría:** Declaras bajo protesta de decir verdad que el código o texto enviado es de tu autoría original o que posees los derechos suficientes para licenciarlo bajo estos términos, libre de componentes con licencias incompatibles (como GPLv3 estricta o software propietario de terceros).

---

## 2. Directiva de Estilo y Anti-Patrones de IA

Toda contribución técnica o de diseño debe cumplir obligatoriamente con el protocolo establecido en:  
`internal_docs/REGLAS_ESTILO_Y_ANTI_PATRONES_IA.md`

Reglas clave para aceptar un PR:
* **Cero emojis en controles:** Prohibido añadir emojis en botones, títulos, menús o barras (`🚀`, `🔍`, `⚙️`, etc.).
* **Modularización estricta:** Ningún módulo de backend en Node.js debe superar las ~300 líneas de código. Si una funcionalidad nueva crece, debe desacoplarse en un archivo auxiliar limpio dentro de `src/`.
* **Cero dependencias npm externas:** El servidor puente opera 100% sobre APIs nativas de Node.js (`node:http`, `node:crypto`, `node:net`, `node:os`, `node:fs`). No se admiten dependencias añadidas a `package.json`.
* **Binarios Android compactos (< 250 KB):** El cliente Android debe construirse en Java nativo puro, sin dependencias infladas de AndroidX, Kotlin Runtime ni librerías pesadas de terceros.

---

## 3. Correcciones de Idioma y Localización

Damos una cálida bienvenida a correcciones de estilo, ortografía y redacción técnica en las traducciones existentes (`README.md`, `README.zh.md`, `README.ja.md`, `README.pt.md`, `README.fr.md`, `README.de.md`) o a la adición de nuevos idiomas.

* **El documento canónico de referencia técnica y conceptual es siempre [README.es.md](README.es.md) (Español de México).**
* Las traducciones deben mantener el registro técnico profesional sobrio de cada idioma (evitar modismos coloquiales inapropiados o giros torpes de traducción automática).

---

## 4. Puerto Seguro para Investigación de Seguridad (Safe Harbor)

Apoyamos la investigación ética y de buena fe:
* Si detectas una vulnerabilidad de seguridad o un fallo en el aislamiento perimétrico, por favor repórtalo de manera responsable a través de los canales privados del proyecto.
* Tinta y Nodos se compromete a no iniciar acciones legales contra investigadores de seguridad que actúen de buena fe bajo los términos de la Sección 8 de [LICENSE](LICENSE).
