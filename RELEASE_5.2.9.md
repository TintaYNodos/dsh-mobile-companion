# DSH Mobile Companion 5.2.9 (`versionCode` 53) — Notas por área, fecha límite y privacidad

Versión de producto de la serie 5.2. **Notas** deja de ser una función secundaria: pasa a tener
perfiles por área, fecha límite, orden y filtros nuevos, cifrado en reposo, modo privado y una
bandeja de notas recibidas en el panel de la PC. Se retira el **chat de destino** porque nunca
entregaba la nota al chat.

## Qué cambia

- **7 perfiles declarativos**: General, Escritor, Programador, Docente, Periodista, Jurídico y
  Diseño. Cada perfil trae sus tipos y estados propios, y la etiqueta de sus dos campos:
  Materia/Grupo o alumno, Caso o tema/Fuente, Expediente/Cliente, Cliente/Proyecto,
  Obra/Personaje, Proyecto/Módulo o archivo y Proyecto/Detalle.
- **Fecha límite (`dueDate`)** con selector de fecha, **orden por vencimiento** y filtros
  **«Con fecha»** y **«Prioridad»**.
- **Búsqueda sin acentos ni mayúsculas**: `garcia` encuentra `García`.
- **Privacidad**: `notes.json` se guarda **cifrado en reposo** (AES-256-GCM con clave del
  AndroidKeyStore), la pantalla de Notas usa **FLAG_SECURE** (sin capturas ni miniaturas) y una
  nota se puede marcar **«Solo en el teléfono»**: no se envía nunca, queda fuera de «Enviar todas»
  y compartirla pide confirmación.
- **Envío a la PC idempotente por `id`**: reenviar una nota actualiza el mismo archivo en la PC en
  vez de duplicarlo. Se permite una **nota de solo título** (el cuerpo puede ir vacío). El envío
  nunca borra nada del teléfono.
- **Front matter del archivo `.md`**: incluye `id`, `dueDate` y `updatedAt`, además del perfil,
  tipo, proyecto, personaje/módulo, etiquetas, estado y prioridad. **Sin `chatTarget`.**
- **Bandeja «Notas recibidas» en el panel de la PC**: las **últimas 10 notas**, en **solo lectura**
  (título, tipo, proyecto y fecha). La lista completa de metadatos, sin cuerpos, está en
  `GET /dsh-companion/notes`.
- **Accesibilidad**: editor desplazable con el teclado abierto, objetivos táctiles de 48 dp o más,
  selección de chips anunciada a TalkBack, región viva de autoguardado, contraste AA en las
  insignias, tarjeta con descripción accesible y título de 2 líneas.

## Se retira el chat de destino

El campo de chat de destino **desaparece de la interfaz, del payload y del puente**. No servía: la
nota no se entregaba al chat, solo se anotaba un nombre. El puente **ignora `chatTarget`** si llega
de una versión anterior y ya no lo valida, no lo escribe en el front matter y no lo usa en el
nombre del archivo. Una nota es un archivo en la PC, no un mensaje de una conversación.

## Qué queda para después

Los **adjuntos** y los **recordatorios del sistema operativo** no entran en la 5.2.9. La fecha
límite de esta versión es un dato de la nota: se ve, se ordena y se filtra, pero no programa avisos.

## Cómo se instala

1. Instala el APK **5.2.9** (`versionCode` 53) **encima de la 5.2.8** (`versionCode` 52): no hace
   falta desinstalar y la firma de release no cambia desde la 5.1.7.
   Si vienes de una versión anterior a la 5.1.7, desinstala una vez.
2. Actualiza el puente desde el repositorio y reinícialo (`stop.bat` + `start.bat`, o deja que el
   autoarranque lo levante). El puente y el APK deben hablar el mismo contrato de notas.
3. Comprueba la versión en Ajustes del teléfono y en
   `http://<IP-PRIVADA>:57420/dsh-companion/status` (`version` y `apkVersionCode`).
4. Abre *Notas* y prueba: crear una nota con fecha límite, marcar otra como «Solo en el teléfono»,
   enviar una nota de solo título y verla en la bandeja del panel.

La política de soporte de la línea sigue en [SUPPORT.md](SUPPORT.md): correcciones de seguridad y
mantenimiento de la serie 5.2, sin promesas de funciones. La comprobación desde el teléfono está en
[CHECKLIST-ESTABLE.md](CHECKLIST-ESTABLE.md), y el detalle de seguridad de las notas en
[SECURITY.md](SECURITY.md).

## Verificación

- `npm test` contra un puente en vivo y la suite de CI (las cifras vigentes las publica el propio
  resultado de la suite y las fija el responsable de la release en el README).
- `node tools/audit-repo.mjs`: sin hallazgos (codificación, enlaces, tablas, versiones y secretos).
- `doctor.ps1 -Json -Report` con recibo verificado por `tools/verify-receipt.mjs`.
- Revisión de la suite de notas: autorización, nota de solo título, idempotencia por `id`, bandeja
  `inbox.jsonl` y `GET /dsh-companion/notes`.
- Comprobación de que no queda `chatTarget` en el payload, el front matter, la bandeja ni el nombre
  del archivo.

## La serie 5.2 sigue

La 5.2.9 no es un parche de seguridad: es la siguiente versión de la serie 5.2, con cambio de
producto. Se instala sobre la 5.2.8 sin desinstalar y mantiene el lector offline de chats, que sigue
necesitando la PC. El historial completo está en [CHANGELOG.md](CHANGELOG.md).

## APK

| Dato | Valor |
| --- | --- |
| Versión | `versionCode 53` / `versionName 5.2.9` |
| Tamaño | 268 296 bytes (262 KB) |
| SHA-256 | `06e0af8f9727a76d6588deaa983b11bcb1688e4e90eac38af4ccd22e4a1bb83d` |
| Firma | v2+v3, certificado de release RSA 4096 (sin cambios desde 5.1.7: se instala encima de 5.2.8) |
