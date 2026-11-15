# VPN gratuitas para DSH Mobile Companion

El teléfono solo llega a la computadora a través de una **red privada** entre ambos. El puente
nunca abre un puerto a Internet. Esta página compara las opciones gratuitas que existen hoy y dice,
sin marketing, **cuáles detecta este proyecto**, cuáles puede enlazar y cuáles no.

La detección vive en [src/network.mjs](src/network.mjs) y el diagnóstico en [doctor.ps1](doctor.ps1).

## Cómo leer la tabla

- **Detectada**: el nombre real del adaptador aparece en la tabla de `src/network.mjs`, así que el
  puente la reconoce sin configuración.
- **Enlazable**: el puente se enlaza a esa IP porque es privada (10/8, 172.16/12, 192.168/16) o
  CGNAT (100.64.0.0/10). El teléfono puede usarla.
- **Genérica**: la interfaz se llama `tun0`/`tap0` y puede ser una VPN corporativa. Solo se acepta
  con `DSH_ALLOW_GENERIC_VPN=1` y bajo tu responsabilidad.
- **Detectada, no enlazable**: se reconoce el nombre, pero su IP no es privada; el puente no
  escucha en direcciones enrutables. Es el caso de Hamachi y Radmin.

## Comparativa

| Proveedor | Tipo | Gratis | Dificultad | ¿Detección automática? | Notas |
| --- | --- | --- | --- | --- | --- |
| Tailscale | Malla WireGuard con coordinación | Plan personal gratis | Baja | Sí, fuerte (`Tailscale`, `ts0`, `tailscale0`) | La más fácil: misma cuenta en PC y teléfono, MagicDNS. Usa 100.64.0.0/10. Recomendada. |
| ZeroTier | Red L2/L3 virtual propia | Plan gratis para uso personal | Baja | Sí, fuerte (`ZeroTier One [...]`, `zt...`) | Red privada con autorización manual de nodos; IP 10.x. Buen control, más pasos que Tailscale. |
| NetBird | Malla WireGuard con coordinación | Plan personal gratis | Baja | Sí, fuerte (`wt0`, `netbird`) | Usa 100.64.0.0/10. Alternativa cercana a Tailscale, con consola propia. |
| Nebula | Malla superpuesta con faros | Cliente gratis; servidor propio | Media | Sí, fuerte por nombre (`nebula1`, `Nebula`) | Necesita faros (lighthouse) propios. IP 10.x configurable. |
| EasyTier | Malla descentralizada | Gratis | Media | Sí, fuerte (`easytier`) | IP 10.126.126.x por defecto. Buen plan B si te bloquean los servicios centralizados. |
| WireGuard | Túnel punto a punto | Gratis | Media | Parcial: fuerte si el adaptador se llama `WireGuard`/`wg0`; si no, genérica con `DSH_ALLOW_GENERIC_VPN=1` | Sin coordinación: hay que configurar claves y rutas. Excelente cifrado, más trabajo. |
| Headscale | Servidor propio compatible con Tailscale | Gratis, autoalojado | Alta | Sí, fuerte: el cliente es Tailscale (`Tailscale`, `tailscale0`) | Necesitas tu propio servidor; el cliente y la detección son los mismos que Tailscale. |
| Tinc | VPN de malla clásica | Gratis | Alta | Parcial: fuerte si la interfaz se llama `tinc`; normalmente es `tun0`/`tap0` (genérica) | Muy flexible y veterana; configuración manual de claves y topología. |
| SoftEther | VPN L2/L3 con servidor propio | Gratis | Alta | Sí por nombre del adaptador (`SoftEther`) | Muy potente y pesada; su IP virtual depende de cómo la configures. |
| Twingate | SD-WAN con conector | Plan personal gratis | Media | Sí, fuerte (`Twingate`, `sdwan`) | Usa 100.64.0.0/10 y requiere un conector instalado en la PC. |
| Hamachi | Red L2 propietaria | Propietario, gratis con límites | Baja | Detectada, no enlazable (`hamachi`, 25/8) | Asigna 25.x.x.x, que no es privada: el puente no debe escuchar ahí. Revisa los límites del plan. |
| Radmin VPN | Red L2 propietaria | Propietario, gratis con límites | Baja | Detectada, no enlazable (`radmin`, 26/8) | Asigna 26.x.x.x, fuera de los rangos privados. Útil para escritorio remoto, no para este puente. |

Los límites de los planes gratuitos cambian: confirma el plan vigente en la web de cada proveedor.
Tailscale y ZeroTier son las dos que la documentación del proyecto usa como camino principal;
NetBird es la tercera más directa.

## Qué soporta y qué no soporta el proyecto

**Sí se soporta y detecta:**

- Tailscale y Headscale (interfaz de Tailscale).
- ZeroTier.
- NetBird.
- Nebula y EasyTier.
- WireGuard por nombre de adaptador.
- Tinc, SoftEther y Twingate por nombre de adaptador.
- CGNAT 100.64.0.0/10 en un adaptador cuyo nombre no parece de sistema.
- `tun`/`tap` genéricos solo con `DSH_ALLOW_GENERIC_VPN=1` (por si es tu red y no la de la oficina).

**No se soporta:**

- Abrir puertos en el router, túneles públicos o un proxy inverso con hostname público.
- Enlazar el puente a la LAN doméstica (192.168/16, 10/8, 172.16/12 sin nombre de VPN) ni a una
  dirección pública. La detección por rango solo confirma: el nombre de la interfaz manda.
- Enlazar Hamachi o Radmin: sus rangos 25/8 y 26/8 no son privados.
- Proveedores no listados: si el adaptador no aparece, no hay detección automática.

Detalle importante: una interfaz llamada `Ethernet`, `Wi-Fi` o `WLAN` con IP 10.x o 192.168.x es la
red de casa u oficina, no una VPN, y el puente la ignora a propósito. Nunca se elige por rango
privado a secas.

## Cómo elige cuando hay varias

La elección es una función pura y testeable, `pickVpnAddress(interfaces)`, en
[src/network.mjs](src/network.mjs). Orden de prioridad:

1. `DSH_BIND_HOST` o `DSH_VPN_IP` si son una IP privada válida (manda sobre todo lo demás).
2. VPN fuerte por nombre: Tailscale/Headscale, ZeroTier, NetBird, Nebula, EasyTier, WireGuard,
   Tinc, SoftEther, Twingate.
3. `tun`/`tap` genérica **solo** con `DSH_ALLOW_GENERIC_VPN=1`.
4. CGNAT 100.64.0.0/10 en un adaptador que no parece físico.
5. Si no hay nada utilizable: `127.0.0.1` y bloqueo explícito. El puente no acepta clientes de red.

Con varias candidatas, `doctor.ps1 -Json` publica:

- `tunnel`: la interfaz elegida.
- `candidates[]`: todas las detectadas, en orden de preferencia, con `ip`, `iface`, `kind` y
  `provider`.
- `phoneUrl`: la URL que debes abrir en el teléfono.

Si la elegida no es la que quieres, fíjala antes de arrancar el puente:

```powershell
$env:DSH_BIND_HOST = "100.101.102.103"
powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json
```

El doctor también imprime, para cada candidata, la línea `DSH_BIND_HOST=<ip>` que corresponde.

## Cómo comprobarlo

```powershell
node test/verify_vpn_detection.mjs
powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json
```

La primera prueba es pura: simula interfaces de Tailscale, ZeroTier, NetBird, Nebula, EasyTier,
LAN doméstica, varias a la vez y ninguna. La segunda es la que vale en tu máquina: revisa que `ok`
sea `true`, que `tunnel` no esté vacío y que `candidates` tenga al menos una entrada enlazable.

## Riesgos honestos

- Toda VPN gratuita tiene un límite y puede cambiar sus condiciones. La red privada es tu
  perímetro: si la compartes o la haces pública, el puente queda expuesto dentro de ella.
- HTTP Basic del puente solo es aceptable porque la VPN cifra el tránsito de extremo a extremo.
  Hamachi y Radmin no se usan aquí, entre otras cosas, porque su rango de direcciones no permite
  aplicar la política de "solo direcciones privadas".
- `DSH_ALLOW_GENERIC_VPN=1` puede aceptar la VPN corporativa de una oficina. Úsalo solo si la
  interfaz es tuya.
- El puente no sustituye una auditoría de seguridad: si algo falla, ejecuta el doctor y no
  improvises abriendo puertos.
