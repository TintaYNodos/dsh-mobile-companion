# Autorizar dispositivos

El teléfono no pide ninguna clave. La primera vez se aprueba desde la computadora.

## Flujo

```text
1. Abres la app en el teléfono.
2. El teléfono muestra "Confirma en la computadora".
3. En la PC se abre solo el panel (o ejecutas panel.bat).
4. Pulsas Autorizar.
5. El teléfono entra solo. No vuelve a preguntar.
```

La pantalla del teléfono se actualiza por sí misma cada 2 segundos.

## El panel

- Escucha **solo en 127.0.0.1:57421**. No es alcanzable desde la VPN: desde otro
  equipo el puente responde 403.
- Exige su **propia credencial**, guardada en `%USERPROFILE%\.dsh\companion-panel-token`.
  `panel.bat` la inyecta en la URL y el panel la cambia por una cookie de una semana,
  para que el token no quede en el historial.
- Muestra las solicitudes pendientes y los **dispositivos autorizados**.
- Cada dispositivo se puede **nombrar** (por ejemplo "Pixel de Ismael"), **revocar**
  individualmente o revocar todos.
- Punto verde si el dispositivo tuvo actividad en los últimos 3 minutos.
- **Actividad reciente**: autorizaciones, rechazos, revocaciones y renombres, con hora.
- Se refresca solo cada 4 segundos, salvo mientras escribes un nombre.

## Vigencia

La sesión dura **30 días** y se **renueva con el uso**: cada vez que abres la app
después de 24 horas, el contador vuelve a 30. Mientras la uses al menos una vez
al mes, no caduca nunca.

## Revocar desde consola

```bat
del "%USERPROFILE%\.dsh\companion-devices.json"
```

El registro se relee cuando el archivo cambia, así que surte efecto en la
petición siguiente, sin reiniciar el puente.

## La clave manual

Sigue existiendo, en `%USERPROFILE%\.dsh\companion-access-key`, para entrar desde
un navegador escribiéndola una vez. La app no la usa.

## Variables

| Variable | Por defecto | Efecto |
| --- | --- | --- |
| `DSH_PANEL_PORT` | `57421` | Puerto del panel local |
| `DSH_PANEL_TOKEN` | autogenerado | Credencial del panel |
| `DSH_DEVICE_TTL_DAYS` | `30` | Días de vigencia de la sesión |
| `DSH_DEVICE_REFRESH_HOURS` | `24` | Cada cuánto se renueva al usarla |
| `DSH_PENDING_TTL_MIN` | `15` | Minutos que una solicitud espera aprobación |
| `DSH_ACCESS_DISABLE=1` | — | Sin aprobación ni clave: cualquiera de la red entra |
