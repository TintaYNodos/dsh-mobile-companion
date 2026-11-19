# Imágenes públicas de documentación

> **Todas las capturas de `screens/` son de demostración.** Se generaron renderizando una maqueta estática del cliente inyectado con datos ficticios («Proyecto Demo», «Nota de ejemplo»). No son capturas de una sesión real ni de un dispositivo real y no contienen IPs, correos, rutas de usuario, nombres de proyectos ni nombres de personas.

## social-preview.png

Tarjeta social de 1280×640 px (fondo `#0D1117`): marca «DSH Mobile Companion», lema «DeepSeek Harness en tu teléfono, dentro de tu red privada», versión **5.4.0**, teléfono estilizado y la etiqueta «Red privada». Compuesta con Pillow; sin capturas ni datos reales.

## screens/

| Archivo | Tamaño | Qué muestra |
| --- | --- | --- |
| `01-dock-vertical-360x800.png` | 360×800 | Vista vertical del chat con el dock de comandos («Auditar», «Explicar», «Pruebas», «Continuar») y la fila de teclas (`Tab`, `Esc`, `{ }`, `[ ]`…). |
| `02-dock-apaisado-teclado-800x360.png` | 800×360 | Vista apaisada con el teclado en pantalla abierto, la fila compacta de comandos/teclas y el compositor reducido. |
| `03-hoja-comandos-360x800.png` | 360×800 | Hoja inferior «Más comandos» abierta con el chip «+», agrupada en Escribir / Código / Trabajo. |
| `04-panel-notas-360x800.png` | 360×800 | Panel de notas con búsqueda, filtros y notas ficticias («Nota de ejemplo», «Ideas para el demo»…). |
| `05-hoja-comandos-800x360.png` | 800×360 | La misma hoja de comandos en apaisado, con la composición compacta. |
| `06-panel-notas-800x360.png` | 800×360 | Panel de notas en apaisado: lista a la izquierda y nota abierta a la derecha. |

## Otras imágenes

- `app.png`: estado vacío del cliente con el proyecto ficticio «Proyecto Demo» (maqueta de demostración).
- `panel.png`: panel de autorización de dispositivos con QR **ilustrativo** (no codifica ninguna URL) y dispositivos ficticios; sin IPs.
- `offline.png`: vista de sesiones sincronizadas / modo satélite; no contiene datos de sesión.

## Cómo se generaron

- Capturas: maqueta HTML/CSS renderizada con Chrome headless (CDP) a 2× y reducida a 360×800 / 800×360 con Pillow; PNG optimizado, menos de 250 KB cada una.
- `social-preview.png`: composición con Pillow (fondo `#0D1117`, glows sutiles, tipografía del sistema Segoe UI).
- `app.png` y `panel.png`: mismas técnicas de maqueta; el QR del panel es un patrón determinista decorativo.

Las capturas no están incrustadas en los README de idioma; este directorio solo documenta los archivos.
