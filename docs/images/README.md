# Imágenes públicas de documentación

> **Todas las capturas de `screens/` son de demostración.** Se generaron renderizando el
> cliente inyectado real del repositorio sobre una maqueta estática con datos ficticios
> («Proyecto Demo», «Nota de ejemplo»). No son capturas de una sesión real ni de un
> dispositivo real y no contienen IPs, correos, rutas de usuario, nombres de proyectos ni
> nombres de personas.

## social-preview.png

Tarjeta social de 1280×640 px (fondo `#0D1117`): marca «DSH Mobile Companion», lema
«DeepSeek Harness en tu teléfono, dentro de tu red privada», versión **5.4.0**, teléfono
estilizado y la etiqueta «Red privada». Compuesta con Pillow; sin capturas ni datos reales.
Es la imagen del Social preview del repositorio.

## screens/

| Archivo | Tamaño | Qué muestra |
| --- | --- | --- |
| `01-dock-vertical-360x800.png` | 360×800 | Vista vertical con la fila única del dock: «Ocultar», «Archivo», comandos del perfil y el compositor debajo. |
| `02-dock-apaisado-teclado-800x360.png` | 800×360 | Vista apaisada con teclado: fila compacta con «Ocultar», «Archivo», «+», «Notas» y teclas de código. |
| `03-hoja-comandos-360x800.png` | 360×800 | Hoja inferior «Más comandos» agrupada en Escribir / Código / Trabajo, con «Cerrar» fijo. |
| `04-panel-notas-360x800.png` | 360×800 | Panel de notas con búsqueda, filtros y notas ficticias. |
| `05-hoja-comandos-800x360.png` | 800×360 | La misma hoja de comandos en apaisado, con «Cerrar» fijo. |
| `06-panel-notas-800x360.png` | 800×360 | Panel de notas en apaisado: lista a la izquierda y nota abierta a la derecha. |

Las seis capturas están incrustadas en la sección de capturas de los siete README de idioma.

## Cómo se generaron

- `01`, `02`, `03` y `05`: el cliente inyectado del repo (`src/mobile-client*.mjs`,
  `src/mobile-styles.mjs`) cargado en una maqueta HTML con el DOM del compositor, renderizado
  con Chrome headless por CDP a 2× y fijado a 360×800 / 800×360. El «teclado» se simula
  encogiendo el viewport por debajo del umbral del cliente.
- `04` y `06`: maqueta del panel de notas con datos ficticios.
- `social-preview.png`: composición con Pillow (fondo `#0D1117`, tipografía del sistema).

Las imágenes se mantienen sin dependencias externas y por debajo de 250 KB cada una.

## launch/

Piezas de una sola imagen para anuncios en redes. No están incrustadas en los README.

- `reddit-launch-1200x675.png`: tarjeta 16:9 para Reddit. Encabezado «cliente no oficial», título,
  tres aclaraciones (no oficial, requiere Harness en tu PC y VPN, BUSL-1.1 source-available), el
  enlace al repositorio y dos capturas de demostración con datos ficticios.