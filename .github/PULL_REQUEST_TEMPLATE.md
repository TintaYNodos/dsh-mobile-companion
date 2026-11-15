<!--
  Plantilla de pull request. Lo que el revisor necesita saber para decidir.
  Borra las secciones que no apliquen y deja las casillas marcadas solo si las
  comprobaste de verdad.
-->

## Qué cambia

<!-- Una o dos frases. Si corrige un fallo, explica el síntoma que veía el usuario. -->

## Por qué

<!-- El problema que resuelve. Enlaza el hallazgo o la incidencia si existe. -->

## Cómo lo comprobaste

<!-- Pega el resultado real, no "funciona". -->

- [ ] `node --check` de los módulos tocados
- [ ] `node tools/audit-repo.mjs` sin hallazgos
- [ ] `node test/run-all.mjs` contra un puente vivo (indica el total)
- [ ] Si toca Android: `javac` sobre `android_src` y APK compilado y firmado
- [ ] Si toca el puente: reiniciado y `bridge.log` revisado

## Checklist

- [ ] No subí números de versión ni `versionCode` sin pedirlo antes.
- [ ] No hay secretos, claves ni IPs privadas en el diff.
- [ ] Actualicé `CHANGELOG.md` si el cambio se nota al usarlo.
- [ ] Si hay ruptura de compatibilidad, está explicada arriba.
- [ ] La licencia sigue siendo Business Source License 1.1 / PolyForm Noncommercial: no introduje
      dependencias ni código con licencia incompatible.

## Notas para el revisor

<!-- Riesgos, partes que no probaste, decisiones que quieres discutir. -->
