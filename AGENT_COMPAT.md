# Compatibilidad de agentes

Esta matriz responde una pregunta concreta: **qué agente puede instalar DSH Mobile Companion en esta
computadora y hasta dónde llega la evidencia**. Nace de una regla del proyecto: no se escribe
"funciona" si no se ha ejecutado aquí.

## Cómo leer los estados

| Estado | Significado |
| --- | --- |
| **Probado en esta máquina** | El flujo descrito se ejecutó contra este repositorio y quedó evidencia (comando y salida). |
| **Documentado, no probado** | El procedimiento está escrito y es razonable, pero **no** se ejecutó con ese agente en este proyecto. Puede requerir ajustes. |
| **Documentado (sin ejecución)** | El agente no tiene shell ni acceso a archivos: el usuario ejecuta los comandos y le pega los resultados. |

Entorno de la prueba: Windows con Windows PowerShell 5.1, Node 24.21.0 (el runtime que trae DSH),
puente de la serie 5 (la prueba original se hizo con la 5.2.0; el árbol actual es la 5.4.0) y un
túnel ZeroTier. Lo probado se probó ahí; si tu entorno es otro, no des por
probado lo que aquí figura como documentado.

## Matriz

| Agente | Estado | Cómo recibe el contexto | Qué puede ejecutar | Limitaciones |
| --- | --- | --- | --- | --- |
| **DSH** (DeepSeek Harness) con la skill `mobile-companion-setup` | **Probado en esta máquina** | Skill del repo enlazada en `.dsh/skills` o `.agents/skills` (o en `<DSH_HOME>/skills`) y una sesión abierta con el directorio de trabajo dentro del repo | Todo: PowerShell, `node`, `doctor.ps1`, `panel.bat`, instaladores y la verificación del recibo | La skill solo se descubre si está enlazada y la sesión se abre dentro del repo; `.dsh/` es local y no se versiona |
| **Claude Code** | Documentado, no probado aquí | Pegar el bloque en español de [AI_SETUP_PROMPT.md](AI_SETUP_PROMPT.md) o pedirle que lea el archivo; el repo abierto | Shell (Bash tool): `powershell -ExecutionPolicy Bypass -File ...`, `node`, consultas locales | No descubre skills de DSH; pide permiso comando a comando; puede no tener `node` en PATH (dale la ruta absoluta); no le dejes hacer `git add/commit` |
| **Cursor** (modo agente/chat) | Documentado, no probado aquí | Abrir el repo y pegar el prompt, o adjuntar `AI_SETUP_PROMPT.md` con `@` | Terminal integrada en Windows | Depende de que permitas la terminal; el contexto del chat es limitado; tampoco descubre skills de DSH |
| **Codex CLI** | Documentado, no probado aquí | Ejecutarlo en la raíz del repo y pegar el prompt; puede leer los archivos del repo | Shell con aprobación; lectura de archivos | Su sandbox de red puede bloquear `/dsh-companion/status` o GitHub; hay que aprobar los comandos; no ejecutes el kill switch |
| **ChatGPT y otros asistentes sin shell** | Documentado (sin ejecución) | Pegar el prompt y, después, el JSON del doctor y la salida del verificador | Nada en la computadora | El usuario ejecuta todo; el asistente mapea `blockers` contra [doctor-fixes.json](doctor-fixes.json) pero no puede verificar el recibo por sí mismo |
| **Modelos locales** (Ollama, LM Studio, llama.cpp…) | Documentado (sin ejecución) | Prompt local y los mismos archivos del repo | Solo si su host integra ejecución de herramientas | Normalmente sin shell; si el host ejecuta comandos, aplican los mismos límites que a un agente con shell |

## DSH con la skill (probado en esta máquina)

La skill `mobile-companion-setup` empaqueta el procedimiento completo: diagnóstico, túnel, puente,
firewall, emparejamiento, avisos y evidencia final. Está en
[skills/mobile-companion-setup](skills/mobile-companion-setup/) y cada `FAIL`/`AVISO` del doctor
tiene su comando en [doctor-fixes.json](doctor-fixes.json).

Evidencia ejecutada aquí:

```text
powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report     -> exit 0, ok=true, recibo escrito
node tools/verify-receipt.mjs doctor-report.json                     -> RECIBO VALIDO
node skills/mobile-companion-setup/scripts/verify-fixes.mjs static   -> static check OK (16 fixes)
```

Texto mínimo de handoff para un agente DSH que ya tiene la skill cargada:

```text
Usa la skill mobile-companion-setup para instalar DSH Mobile Companion en esta máquina.
Empieza con `powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report` y termina con
`node tools/verify-receipt.mjs doctor-report.json` mostrando su OK. No inventes una IP ni una
versión y no declares éxito sin esas dos salidas.
```

## La skill solo se descubre en las raíces de skills de DSH

DSH escanea, en orden: `<raíz del proyecto>/.dsh/skills`, `<raíz del proyecto>/.agents/skills`,
`<DSH_HOME>/skills`. El repo no trae esos directorios versionados: se enlazan en la máquina. En
Windows, un junction no necesita permisos de administrador:

```powershell
# Proyecto, raíz .dsh (la que usa el repo)
New-Item -ItemType Directory -Force .dsh\skills | Out-Null
cmd /c mklink /J .dsh\skills\mobile-companion-setup skills\mobile-companion-setup

# Alternativa: raíz .agents (también la escanea DSH)
New-Item -ItemType Directory -Force .agents\skills | Out-Null
cmd /c mklink /J .agents\skills\mobile-companion-setup skills\mobile-companion-setup

# A nivel de usuario, para todas las sesiones
New-Item -ItemType Directory -Force "$env:USERPROFILE\.dsh\skills" | Out-Null
cmd /c mklink /J "$env:USERPROFILE\.dsh\skills\mobile-companion-setup" "$PWD\skills\mobile-companion-setup"
```

Después hay que abrir una sesión nueva: el catálogo de skills se arma al iniciar. Si no ves la skill
en la lista, revisa que la sesión se abrió con el directorio de trabajo dentro del repo y que el
enlace apunta a una carpeta con `SKILL.md`.

## Claude Code, Cursor y Codex CLI (documentado, no probado aquí)

Los tres ejecutan comandos en Windows, así que pueden hacer todo el flujo; la diferencia es cómo les
llega el contexto. No cargan skills de DSH: se les da el prompt de [AI_SETUP_PROMPT.md](AI_SETUP_PROMPT.md)
(bloque español) y trabajan con los archivos del repo.

Texto mínimo de handoff para un agente con shell:

```text
Lee AI_SETUP_PROMPT.md de este repo y ejecútalo al pie de la letra en Windows. Empieza con
`powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report`; si hay blockers, mapa el texto
contra doctor-fixes.json y corrige uno por uno. Termina con
`node tools/verify-receipt.mjs doctor-report.json` y pega su salida. Nunca expongas el puente a
Internet, no imprimas la clave de acceso y no ejecutes el kill switch.
```

Detalles por agente:

- **Claude Code**: pide permiso por cada comando; conviene aprobar PowerShell y `node` de una vez.
  Si no encuentra `node`, pasa la ruta absoluta del runtime (`%USERPROFILE%\.dsh\dsh-runtimes\...`).
- **Cursor**: usa el modo agente con el repo abierto; la terminal integrada es la que ejecuta el
  doctor. No usa `.dsh/skills`, así que el prompt es obligatorio.
- **Codex CLI**: arranca en la raíz del repo para que lea `doctor.ps1` y `doctor-fixes.json`. Su
  sandbox de red puede impedir consultar el puente y GitHub: pide permiso de red o ejecuta el doctor
  con el usuario y pégale la salida.

## ChatGPT y asistentes sin shell; modelos locales (documentado)

No pueden ejecutar nada en la computadora. El reparto es: el usuario ejecuta, el asistente interpreta.
El recibo es justo lo que hace útil ese reparto: el JSON se puede comprobar y pegar sin ambigüedad.

```powershell
# 1. El usuario genera el informe (sin BOM, con recibo)
powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report

# 2. El usuario verifica el recibo y pega esta salida
node tools/verify-receipt.mjs doctor-report.json

# 3. Opcional: exigir el APK publicado y la huella del certificado de release
node tools/verify-receipt.mjs doctor-report.json `
  --expect-apk-sha256 2c41ece9f5632c6205fdb5ac15036a3e8f46e1a88d9748e3414c62b3474c0cd1 `
  --expect-cert 4F:E1:AD:C0:45:71:AF:2B:89:1B:E4:6B:1B:3C:86:39:65:F6:73:A6:B7:25:87:61:47:96:91:7F:49:63:65:23
```

El SHA-256 de la 5.4.0 (`74d6a8c1…a701848`) se toma del campo `apkSha256` de `RELEASES.json` una
vez compilada la build; no se inventa ni se copia de una versión anterior. La verificación de esa
build dio 418 comprobaciones en local con el APK presente y 413 en CI (allí 3 se omiten con motivo:
2 por el APK gitignored y 1 por ser exclusiva de Windows), más 915 comprobaciones Java ejecutadas en
local.

Texto mínimo de handoff para un asistente sin shell:

```text
Te pego la salida de `powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report` y de
`node tools/verify-receipt.mjs doctor-report.json`. Primero dime si el recibo es válido; después
mapea cada blocker contra doctor-fixes.json y dame los pasos exactos. No inventes IPs ni versiones.
```

Los modelos locales entran en esta misma fila salvo que su host tenga ejecución de herramientas; en
ese caso se comportan como un agente con shell y aplican las advertencias de la sección anterior.

## El recibo del informe

`doctor.ps1 -Report` escribe `doctor-report.json` sin BOM con estos campos añadidos:

| Campo | Contenido |
| --- | --- |
| `apkSha256` | SHA-256 del APK que el puente sirve de verdad, calculado en vivo desde `/dsh-companion/status` |
| `apkVersion` | Versión del APK anunciada por el puente (`5.4.0` en la release actual) |
| `apkVersionCode` | `versionCode` de Android anunciado por el puente (`66` en la release actual) |
| `certSha256Release` | Huella documental del certificado del keystore de release (la de README y SECURITY.md) |
| `receipt` | `algorithm` (`sha256`), `canonical` (`json-compact-sin-receipt`) y `sha256` del informe |

El canon exacto está documentado en la cabecera de [tools/verify-receipt.mjs](tools/verify-receipt.mjs):
se hashea `JSON.stringify(JSON.parse(archivo) sin la clave receipt)`, es decir el JSON compacto del
informe con sus claves en orden. La indentación no importa y los escapes de PowerShell 5.1 tampoco
estorban, porque se normaliza el valor.

El recibo prueba **integridad del contenido escrito** (nadie cambió un campo después de generarlo),
no autenticidad: no es una firma y cualquiera puede generar un informe nuevo. Para atar el entorno a
la release publicada se usan `--expect-apk-sha256` y `--expect-cert`.

## Lo que no está probado (huecos)

- **Solo DSH está probado en esta máquina.** Claude Code, Cursor, Codex CLI, ChatGPT y los modelos
  locales aparecen documentados: si algo falla con ellos, es un hueco de esta matriz, no del doctor.
- **No se probó el flujo de instalación completo desde otro agente.** El doctor, el recibo y el mapa
  de fallos sí se ejecutaron; emparejar el teléfono, abrir el panel y probar avisos lo hizo el
  usuario y no se repitió con cada agente.
- **La carga de la skill en una sesión DSH nueva no se repitió en esta pasada.** El junction existe y
  DSH documenta esas raíces; la apertura de sesión es lo único que no se volvió a probar aquí.
- **macOS y Linux no se probaron.** El doctor se probó en Windows; los instaladores para macOS y
  Linux existen pero no se ejecutaron en esta máquina.
- **Un informe de una versión anterior del doctor no tiene recibo.** `verify-receipt.mjs` falla por
  diseño; la solución es regenerarlo con el doctor actual.
- **La espera del puente no está cubierta.** Si el puente no responde, el recibo sigue siendo válido
  pero `apkSha256` y `apkVersion` salen vacíos; usa `--expect-apk-sha256` si necesitas exigir el APK.

## Otros documentos

- [README.es.md](README.es.md) — instalación y uso.
- [AI_SETUP_PROMPT.md](AI_SETUP_PROMPT.md) — el prompt completo, en inglés y en español.
- [doctor.ps1](doctor.ps1) — el diagnóstico y el recibo.
- [doctor-fixes.json](doctor-fixes.json) — fallo a solución.
- [skills/mobile-companion-setup/SKILL.md](skills/mobile-companion-setup/SKILL.md) — el procedimiento como skill.
