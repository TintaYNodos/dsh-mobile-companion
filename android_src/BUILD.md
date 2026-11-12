# Compilación del APK

Requisitos: JDK 17 o superior y Android SDK con `build-tools` y `platforms/android-35`.

```powershell
# 1. Clases
javac -encoding UTF-8 -nowarn -cp "$SDK\platforms\android-35\android.jar" `
      -d out\classes android_src\MainActivity.java

# 2. DEX
d8 --min-api 24 --output out\dex out\classes\*.class

# 3. Recursos
aapt2 compile --dir res -o out\res.zip
aapt2 link -o out\base.apk -I "$SDK\platforms\android-35\android.jar" `
      --manifest android_src\AndroidManifest.xml `
      --min-sdk-version 24 --target-sdk-version 34 `
      --version-code 4 --version-name 3.1.0 out\res.zip

# 4. DEX dentro del APK (sin recomprimir el resto)
#    Se añade la entrada "classes.dex" con nombre en barra normal.

# 5. Alinear y firmar
zipalign -p -f 4 out\base.apk out\aligned.apk
apksigner sign --ks dsh.keystore --ks-key-alias dshcompanion out\aligned.apk
apksigner verify --verbose out\aligned.apk
```

## Nota sobre el empaquetado

`Compress-Archive` de PowerShell 5.1 escribe las rutas del zip con **barra
invertida** (`res\drawable\x.xml`). Un APK con esa estructura no se instala:
Android no puede leer el índice de entradas. Hay que usar `aapt2 link`, que
genera el zip con barras normales, y añadir el DEX con `ZipArchive` nombrando la
entrada explícitamente como `classes.dex`.

`resources.arsc` debe quedar **sin comprimir**; `aapt2 link` ya lo hace así.

## Versión

`versionCode` 4, `versionName` 3.1.0. Al subir la versión hay que incrementar
`versionCode` en el comando de `aapt2 link`, no en el manifiesto.

## Firma

La clave de firma debe ser siempre la misma. Si cambia, Android rechaza la
actualización con `INSTALL_FAILED_UPDATE_INCOMPATIBLE` y hay que desinstalar la
versión anterior.
