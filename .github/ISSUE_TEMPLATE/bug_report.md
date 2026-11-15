---
name: Bug report
about: Algo no funciona como debería en el puente, la app o la página offline
title: ""
labels: bug
assignees: ""
---

<!--
  Antes de abrir el informe:
  - Si es un problema de SEGURIDAD, no lo publiques aquí: usa el aviso privado
    descrito en SECURITY.md.
  - Lee "Límites honestos" del README: la VPN, el cifrado del túnel y las
    decisiones de producto no son fallos.
  - Revisa `bridge.log`: casi siempre dice la causa exacta.
-->

## Qué pasa

<!-- Síntoma concreto. "No funciona" no ayuda. -->

## Qué esperabas que pasara

## Pasos para reproducirlo

1.
2.
3.

## Entorno

- Versión de DSH Companion (`/dsh-companion/status` → `version`/`apkVersion`):
- Plataforma del puente (Windows / macOS / Linux / Docker):
- Versión de Node (`node --version`) y de DeepSeek Harness:
- Teléfono y versión de Android (si aplica):
- ¿El puente está en loopback, LAN o VPN? ¿Qué red (ZeroTier, Tailscale, otra)?

## Evidencia

<!--
  Pega las líneas relevantes de `bridge.log`. El puente nunca escribe la clave
  completa: aun así, revisa que no haya datos que no quieras compartir.
-->

```
```

## ¿Lo intentaste ya?

- [ ] Reiniciar el puente y volver a probar
- [ ] Volver a emparejar el teléfono desde el panel local
- [ ] Comprobar que DeepSeek Harness está encendido (`dshOnline` en `/status`)
