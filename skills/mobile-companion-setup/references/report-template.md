# Informe final con evidencia

El trabajo no termina cuando el puente arranca: termina cuando el informe demuestra que funciona.
Sin evidencia, el estado es "pendiente".

## Reglas del informe

- Pega la salida **real** de los comandos; no la resumas ni la reescribas de memoria.
- No inventes valores: `tunnel`, `phoneUrl`, `bridgeVersion` y `nodeVersion` salen del JSON.
- Redacta secretos: nunca la clave de acceso, el token del panel, cookies ni `.credentials.yaml`.
- Si algo falla, di qué falla, con qué comando y con qué salida. No escondas errores.
- Distingue "hecho y verificado" de "hecho pero sin prueba del usuario" (por ejemplo, el aviso de
  prueba solo lo puede confirmar el teléfono).

## Forma exacta del informe

```text
Túnel:          <interfaz> -> <IP privada>
URL teléfono:   http://<IP privada>:57420
Puente:         versión <x>, en línea
Panel:          127.0.0.1:57421
Emparejamiento: <emparejado / pendiente>
Avisos:         <resultado de la prueba>
Pendiente:      <lo que siga fallando, o "nada">
```

En inglés, si el usuario lo pide:

```text
Tunnel:        <interface> -> <private IP>
Phone URL:     http://<private IP>:57420
Bridge:        version <x>, online
Panel:         127.0.0.1:57421
Pairing:       <paired / pending>
Notifications: <test result>
Remaining:     <anything still failing, or "none">
```

## Evidencia que acompaña al informe

1. Salida del diagnóstico final (JSON o tabla de checks, sin secretos):

       powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report

2. Salida del mapeo del informe:

       node skills/mobile-companion-setup/scripts/verify-fixes.mjs report doctor-report.json

   Debe indicar cuántos FAIL/AVISO mapeó y ningún `SIN MAPA`.

3. Salida humana, si el usuario prefiere el texto:

       powershell -ExecutionPolicy Bypass -File doctor.ps1

## Ejemplo de informe completo (valores ficticios)

```text
Túnel:          Tailscale -> 100.64.0.24
URL teléfono:   http://100.64.0.24:57420
Puente:         versión 5.1.7, en línea
Panel:          127.0.0.1:57421
Emparejamiento: emparejado (código 4821)
Avisos:         prueba enviada; aviso recibido en el teléfono
Pendiente:      nada
```

Los valores del ejemplo son ficticios: en un informe real se copian del JSON de esta máquina.

## Si no se puede cerrar

- **Falta el túnel**: `Pendiente: falta red privada (ZeroTier/Tailscale)`. No hay URL del teléfono.
- **El usuario no probó el aviso**: `Avisos: pendiente de confirmación en el teléfono`.
- **Un mensaje no está en el mapa**: `Pendiente: mensaje sin fix verificado: <mensaje exacto>`. Se
  reporta y se detiene; no se inventa la solución.
