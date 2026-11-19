# Cómo publicar una versión

Checklist para quien mantiene el repositorio. Todo se hace desde la carpeta del proyecto, sin
Gradle ni Android Studio.

## 1. Subir la versión

**La única fuente de verdad de la versión es [`src/config.mjs`](src/config.mjs).** No hay
otro sitio que se edite a mano:

| Campo de `src/config.mjs` | Significado |
| --- | --- |
| `version` | Versión del proyecto (`MAJOR.MINOR.PATCH`). |
| `apkVersion` | Versión que anuncia el APK; debe ser igual a `version`. |
| `apkVersionCode` | Entero que sube de uno en uno en cada build publicado. |

Los demás archivos son **espejos** que se actualizan a partir de esos campos:

- `package.json` (`version`) — igual a `config.version`.
- `android_src/AndroidManifest.xml` (`android:versionCode` y `android:versionName`) — iguales a
  `config.apkVersionCode` y `config.apkVersion`.
- `README*.md` (los 7 idiomas), `SECURITY.md` y `CHANGELOG.md` — texto para personas; se copian
  los valores de `config.mjs` al publicar y no se inventan cifras nuevas.
- `RELEASES.json` — registro de las versiones selladas; la entrada se añade al sellar, no en cada
  commit, y puede prepararse con `commit`/`apkSha256` sin completar hasta que exista la build
  (campos y política en la sección 1b).

**Cómo se valida:** [`tools/audit-repo.mjs`](tools/audit-repo.mjs) lee los tres archivos de código y
falla si `package.json` no coincide con `config.version`, si `apkVersion` no coincide con
`versionName` o si `apkVersionCode` no coincide con `versionCode`. También falla si la versión y el
`versionCode` que declaran los 7 README o la última entrada de `CHANGELOG.md` no son los de
`config.mjs` (así una release no sale con documentación de otra versión). `SECURITY.md` y el resto
de la prosa se revisan a mano. Cuando todo está bien imprime
`versión coherente: <version> / versionCode <código>`. La auditoría completa corre en la
CI (`.github/workflows/verify.yml`, Node 22) en cada push y en cada pull request, así que una
versión desincronizada entre código, manifiesto y documentación no pasa el control.

Regla de numeración (SemVer):

- **MAJOR** si cambia el modelo de confianza, la identidad de los dispositivos, el flujo de
  emparejamiento, o algo que obligue a volver a emparejar.
- **MINOR** si añade funciones sin romper nada.
- **PATCH** si solo corrige fallos.

`versionCode` sube **solo al sellar**, de uno en uno sobre el `apkVersionCode` de `src/config.mjs`
(el registro puede no ser consecutivo: si hubo builds internas que no se registraron, el salto queda
documentado en las `notes` de la entrada). Es lo que permite instalar la actualización encima.
Durante el desarrollo y las pruebas no se toca; al publicar debe coincidir con el build que se sube.

Después actualiza `README*.md` (versión y `versionCode`), `SECURITY.md` (versiones soportadas),
`SUPPORT.md`, `OPERACION.md`, `AGENT_COMPAT.md`, `test/README.md`, `LICENSING.md`/`LICENSE` y
`CHANGELOG.md` (entrada nueva arriba, con una sección `### Breaking changes` si es MAJOR). El detalle
del release va en `RELEASE_<version>.md`.

### 1b. `RELEASES.json`: el registro legible por máquina

[`RELEASES.json`](RELEASES.json) (raíz del repo) es el registro de las versiones **publicadas**:
versión, `versionCode`, canal, fecha, commit publicado, SHA-256 del APK y huella del certificado.
No lo genera ningún script: la entrada se añade a mano al publicar.

```json
{
  "schemaVersion": 1,
  "releases": [
    {
      "version": "5.4.0",
      "versionCode": 66,
      "channel": "stable",
      "releasedAt": "2026-11-18",
      "commit": "d162cd7adbfffaa428d7588976fbb02fd066e04a",
      "apkSha256": "74d6a8c1d66ad45af661915db7a851535c74d80bd9b7166ead6c89784a701848",
      "certSha256": "4F:E1:AD:C0:45:71:AF:2B:89:1B:E4:6B:1B:3C:86:39:65:F6:73:A6:B7:25:87:61:47:96:91:7F:49:63:65:23",
      "notes": "Version estable final de la serie 5 (versionCode 66). Detalle en CHANGELOG.md y RELEASE_5.4.0.md."
    }
  ]
}
```

**Preparación antes de compilar.** La entrada se escribe con el `commit` y el `apkSha256` reales
del build que se publica; si la build aún no existe, esos dos campos se dejan sin completar y se
rellenan con `git rev-parse HEAD` y el SHA-256 que imprime `build-release.ps1` **antes** de
etiquetar. El registro nunca se publica con campos sin completar.

| Campo | Tipo | Cómo se rellena |
| --- | --- | --- |
| `schemaVersion` | número | `1`; solo cambia si cambia la forma del registro. |
| `releases[]` | array | Una entrada por versión publicada, en orden de `versionCode` ascendente. La nueva se añade al final. |
| `version` | string | `MAJOR.MINOR.PATCH` de `src/config.mjs`. |
| `versionCode` | número | `apkVersionCode` de `src/config.mjs` en el commit publicado. |
| `channel` | string | `stable` para una versión estable; `prerelease` para una versión preliminar. |
| `releasedAt` | string | Fecha de la publicación en GitHub, `AAAA-MM-DD`. |
| `commit` | string | SHA completo del **commit de origen** con el que se compiló el APK (el commit de versión). El registro se añade en el commit siguiente, que es el que se etiqueta: un commit no puede contener su propio SHA. |
| `apkSha256` | string | 64 hex en minúsculas: el SHA-256 que imprime `build-apk.ps1` y que sirve el puente. |
| `certSha256` | string | Huella SHA-256 del certificado de release (sección 3), con sus dos puntos. |
| `notes` | string | Una línea de resumen; el detalle va en `CHANGELOG.md` y en las notas del release. |

Reglas:

- JSON válido y UTF-8 sin BOM: nada de comentarios ni comas finales. La auditoría
  (`node tools/audit-repo.mjs`) comprueba en cada push que el JSON parsea.
- Una entrada por versión publicada; no se reescriben ni se borran las anteriores.
- El `commit` es el commit de origen del binario (el commit de versión, con el código que se
  compiló). Como un commit no puede contener su propio SHA, la entrada se escribe **después** del
  commit de release: el SHA se obtiene con `git rev-parse HEAD` y la entrada se añade en el commit
  siguiente, que es el que se etiqueta con `v<version>`. El árbol etiquetado incluye así el registro
  completo y el `commit` registrado señala el código exacto que se compiló.
- `version` y `versionCode` deben coincidir con `src/config.mjs` en ese commit; si no coinciden, la
  release no se publica.
- Al publicar una versión se añade su objeto al final de `releases`, con `channel: "stable"` (o
  `"prerelease"` para una versión preliminar) y los datos del build que se sube.

## 2. Verificar

```bash
node test/run-all.mjs       # la suite contra un puente en marcha
node tools/audit-repo.mjs   # texto, sintaxis, enlaces, versiones
node test/verify_config_guard.mjs   # guardas de configuración, sin puente
```

La suite necesita el puente arrancado (`start.bat` o `run-hidden.vbs`) y habla con la instancia
real; su contrato, variables de entorno y pruebas destructivas están en
[`test/README.md`](test/README.md). Requiere **Node >= 22.15.0**: los avisos por turno leen frames
zstd con `node:zlib`.

## 3. Construir el APK

Hay dos formas:

- **Release (la buena)**: `powershell -ExecutionPolicy Bypass -File build-release.ps1`.
  Firma con el keystore del proyecto en `~/.dsh/release-keys/dsh-companion-release.keystore`.
  La contraseña se lee de `~/.dsh/release-keys/keystore-password.txt`, fuera del repositorio.
- **Desarrollo**: `build-apk.ps1` a secas; firma con el keystore de depuración.

> **El keystore de release no se versiona y no se puede perder.** Sin él no puedes publicar
> actualizaciones que se instalen encima. Guárdalo en un lugar seguro y con copia de respaldo.
> Certificado: SHA-256 `4F:E1:AD:C0:45:71:AF:2B:89:1B:E4:6B:1B:3C:86:39:65:F6:73:A6:B7:25:87:61:47:96:91:7F:49:63:65:23` (SHA-1 `76:CF:AF:A2:74:5F:8A:B2:D9:E4:B2:92:E6:1E:F1:7A:3B:9C:83:D5`).
>
> Cambiar de firma obliga a desinstalar la app una vez: Android rechaza una actualización
> firmada con otra clave. Avísalo en las notas del release.

```powershell
powershell -ExecutionPolicy Bypass -File build-apk.ps1
```

Firma con `%USERPROFILE%\.android\debug.keystore` por defecto. Para usar tu propia clave:

```powershell
powershell -ExecutionPolicy Bypass -File build-apk.ps1 -KeyStore C:\ruta\release.keystore -Alias miclave -StorePass ****
```

El APK queda en `DSH-Companion.apk` con su SHA-256 impreso. **No se versiona**: el `.gitignore`
excluye `*.apk` a propósito, porque los binarios van como assets del release.

> Si el puente se expone detras de un proxy o tunel, hay que arrancarlo
> con `DSH_ALLOW_PROXY_ACCESS=1`; sin ese flag rechaza las peticiones que llegan por proxy.

## 4. Commit, tag y push

```bash
git add -A
git commit -m "release: <version> (versionCode <código>)"
git tag -a v<version> -m "DSH Mobile Companion <version> (versionCode <código>)"
git push origin main
git push origin v<version>
```

El tag debe apuntar al commit que se publica. Si algo se corrige después, o se mueve el tag
(`git push --force origin v<version>`) o se publica como versión nueva: lo segundo es lo normal.

## 5. Release en GitHub

1. *Releases* → *Draft a new release* → elige el tag que acabas de subir.
2. Título: `DSH Mobile Companion <version> (versionCode <código>)`.
3. Cuerpo: qué cambia, qué rompe y el SHA-256 del APK. Sin descripciones vacías.
4. Adjunta `DSH-Companion.apk` y publica.
5. Añade la entrada de esta versión a `RELEASES.json` (sección 1b) con el SHA del tag, el SHA-256
   del APK y la fecha de publicación; commitea el registro.

## 5b. Presentación del repositorio

En *Settings → Social preview* sube `docs/images/social-preview.png` (1280×640). En *About* revisa la descripción y los topics; el release de la 5.4.0 debe quedar como *latest* y las builds anteriores de la serie 5 como *pre-release*.

## 6. Comprobar lo publicado

```bash
git clone https://github.com/TintaYNodos/dsh-mobile-companion.git /tmp/check
cd /tmp/check
node tools/audit-repo.mjs
```

La auditoría se ejecuta sobre los archivos versionados del clon, así que si pasa, lo publicado
está sano. Después descarga el APK del release y compara su SHA-256 con el que imprimió el build.
