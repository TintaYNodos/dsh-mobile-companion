# Cómo publicar una versión

Checklist para quien mantiene el repositorio. Todo se hace desde la carpeta del proyecto, sin
Gradle ni Android Studio.

## 1. Subir la versión

Hay tres sitios que deben coincidir y uno que se deriva de ellos:

| Archivo | Qué cambia |
| --- | --- |
| `src/config.mjs` | `version`, `apkVersion`, `apkVersionCode`, y `previousApkVersion`/`previousApkVersionCode` |
| `android_src/AndroidManifest.xml` | `android:versionCode`, `android:versionName` |
| `package.json` | `version` (debe ser igual a `config.version`) |

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
npm test          # 136 comprobaciones contra un puente en marcha
node tools/audit-repo.mjs   # texto, sintaxis, enlaces, versiones
```

La suite necesita el puente arrancado (`start.bat` o `run-hidden.vbs`) y habla con la instancia
real: vacía el registro de dispositivos antes de correrla y restáuralo después.

## 3. Construir el APK

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
git commit -m "release: 5.0.0 (versionCode 38)"
git tag -a v5.0.0 -m "DSH Mobile Companion 5.0.0 (versionCode 38)"
git push origin main
git push origin v5.0.0
```

El tag debe apuntar al commit que se publica. Si algo se corrige después, o se mueve el tag
(`git push --force origin v5.0.0`) o se publica como versión nueva: lo segundo es lo normal.

## 5. Release en GitHub

1. *Releases* → *Draft a new release* → elige el tag que acabas de subir.
2. Título: `DSH Mobile Companion 5.0.0 (versionCode 38)`.
3. Cuerpo: qué cambia, qué rompe y el SHA-256 del APK. Sin descripciones vacías.
4. Adjunta `DSH-Companion.apk` y publica.

## 6. Comprobar lo publicado

```bash
git clone https://github.com/TintaYNodos/dsh-mobile-companion.git /tmp/check
cd /tmp/check
node tools/audit-repo.mjs
```

La auditoría se ejecuta sobre los archivos versionados del clon, así que si pasa, lo publicado
está sano. Después descarga el APK del release y compara su SHA-256 con el que imprimió el build.
