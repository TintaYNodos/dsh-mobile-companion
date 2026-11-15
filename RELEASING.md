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
| `previousApkVersion` / `previousApkVersionCode` | Versión anterior real, para poder revertir. |

Los demás archivos son **espejos** que se actualizan a partir de esos campos:

- `package.json` (`version`) — igual a `config.version`.
- `android_src/AndroidManifest.xml` (`android:versionCode` y `android:versionName`) — iguales a
  `config.apkVersionCode` y `config.apkVersion`.
- `README*.md` (los 7 idiomas), `SECURITY.md` y `CHANGELOG.md` — texto para personas; se copian
  los valores de `config.mjs` al publicar y no se inventan cifras nuevas.

**Cómo se valida:** [`tools/audit-repo.mjs`](tools/audit-repo.mjs) lee los tres archivos de código y
falla si `package.json` no coincide con `config.version`, si `apkVersion` no coincide con
`versionName` o si `apkVersionCode` no coincide con `versionCode`. Cuando todo está bien imprime
`versión coherente: <version> / versionCode <código>`. Los README y `SECURITY.md` no los comprueba
la máquina: son texto que se copia del código en el paso anterior. La auditoría completa corre en la
CI (`.github/workflows/verify.yml`, Node 22) en cada push y en cada pull request, así que una
versión desincronizada entre código y manifiesto no pasa el control.

Regla de numeración (SemVer):

- **MAJOR** si cambia el modelo de confianza, la identidad de los dispositivos, el flujo de
  emparejamiento, o algo que obligue a volver a emparejar.
- **MINOR** si añade funciones sin romper nada.
- **PATCH** si solo corrige fallos.

`versionCode` sube **siempre**, de uno en uno: es lo que permite instalar la actualización encima.

Después actualiza `README*.md` (versión y `versionCode`), `SECURITY.md` (versiones soportadas) y
`CHANGELOG.md` (entrada nueva arriba, con una sección `### Breaking changes` si es MAJOR).

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

## 5b. Presentación del repositorio

En *Settings → Social preview* sube `docs/images/social-preview.png` (1280×640). En *About* revisa la descripción y los topics; el release de la serie 5 debe quedar como *latest* y los 5.2.x como *pre-release*.

## 6. Comprobar lo publicado

```bash
git clone https://github.com/TintaYNodos/dsh-mobile-companion.git /tmp/check
cd /tmp/check
node tools/audit-repo.mjs
```

La auditoría se ejecuta sobre los archivos versionados del clon, así que si pasa, lo publicado
está sano. Después descarga el APK del release y compara su SHA-256 con el que imprimió el build.
