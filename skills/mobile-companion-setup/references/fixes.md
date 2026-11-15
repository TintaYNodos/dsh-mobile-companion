# Mapa de soluciones (`$RepoRoot/doctor-fixes.json`)

`$RepoRoot/doctor-fixes.json` traduce cada mensaje de `doctor.ps1` a una solución accionable. Es la pieza que
impide improvisar: si un mensaje no está en el mapa, no hay solución verificada.

## Dónde vive y qué contiene

- Archivo: `$RepoRoot/doctor-fixes.json` (raíz del repo, junto a `doctor.ps1`).
- Clave `fixes`: diccionario de id estable → fix.
- Cada fix tiene `match`, `matchRuntime`, `title`, `command`, `docs` y `blocking`.

| Campo | Uso |
| --- | --- |
| `id` | Clave estable del fix; no cambia aunque cambie el mensaje. |
| `match` | Texto exacto de la llamada `Bad`/`Warn` en `doctor.ps1`, con sus `$variables` tal cual. |
| `matchRuntime` | Fragmento o lista de fragmentos que deben aparecer en el mensaje real del JSON. |
| `title` | Qué falta, en una línea. |
| `command` | Comando que lo corrige, o `null` si hace falta una acción humana. |
| `docs` | Archivo del repo (relativo a la raíz) o URL oficial. |
| `blocking` | `true` = FAIL (rompe `ok`); `false` = AVISO del diagnóstico. |

## Cómo mapear un mensaje (algoritmo)

1. Toma cada string de `blockers[]` y de `warnings[]` del JSON. No uses `checks[].id`.
2. Para cada fix, normaliza `matchRuntime` a lista y comprueba que **todos** sus fragmentos están
   contenidos en el mensaje (comparación exacta, sensible a mayúsculas y acentos).
3. Si más de un fix coincide, gana el que tenga más caracteres de fragmentos coincidentes.
4. Si ninguno coincide: no improvises. Detente, reporta el mensaje exacto y el comando que lo
   produjo. Un mensaje sin fix es un hueco del mapa, no una invitación a inventar.
5. Aplica el `command` del fix (o pide al usuario la acción si es `null`), vuelve a ejecutar
   `doctor.ps1 -Json -Report` y repite hasta que `ok: true` y los avisos relevantes estén resueltos.

`scripts/verify-fixes.mjs report <archivo>` hace exactamente este mapeo y marca `SIN MAPA` cuando
algo no encaja. Úsalo antes de dar el trabajo por terminado.

## Ids disponibles (hoy)

| id | blocking | Qué cubre |
| --- | --- | --- |
| `node-missing` | sí | No hay Node.js. |
| `node-too-old` | sí | Node anterior a 22.15. |
| `dsh-home-missing` | sí | No existe el directorio de DSH. |
| `harness-credentials-missing` | sí | Faltan credenciales de Harness. |
| `no-private-tunnel` | sí | No hay ZeroTier ni Tailscale con IP privada. |
| `bridge-wrong-service` | sí | El puerto del puente lo ocupa otro servicio. |
| `bridge-unreachable` | sí | El puente no responde. |
| `panel-not-listening` | sí | El panel no escucha. |
| `access-key-pending` | no | Aún no hay clave de acceso (normal). |
| `bind-host-override` | no | `DSH_BIND_HOST` fuerza la IP. |
| `bridge-unchecked-no-tunnel` | no | Sin túnel no se puede comprobar el puente. |
| `harness-offline` | no | Harness no contesta en la PC. |
| `firewall-rule-missing` | no | Falta regla de firewall para el puerto. |
| `firewall-query-failed` | no | No se pudo leer el firewall. |

## Cómo ampliar el mapa (mantenedores)

1. Localiza la llamada en `doctor.ps1`: `Bad "..."` para FAIL, `Warn "..."` para AVISO. `F("...")`
   es la forma histórica de FAIL y también debe cubrirse.
2. Copia el texto **completo** entre comillas como `match`, incluyendo `$variables`.
3. Arranca el caso real (o la copia temporal de `references/doctor-contract.md`), copia el mensaje
   exacto del JSON y elige fragmentos que no dependan de la máquina como `matchRuntime`.
4. Añade el fix al archivo con un `id` nuevo en kebab-case.
5. Verifica:
   - `node skills/mobile-companion-setup/scripts/verify-fixes.mjs static`
   - `node skills/mobile-companion-setup/scripts/verify-fixes.mjs report <informe-json>`
   - `node tools/audit-repo.mjs`
6. No cambies el `match` de un fix existente para "hacerlo pasar": si `doctor.ps1` cambió el
   mensaje, actualiza `match` y `matchRuntime` a la vez.
