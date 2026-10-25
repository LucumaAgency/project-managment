# 11 · API para bots

Para que el bot de Telegram de Lucuma (o cualquier integración) consulte, cree y complete
tareas, y cree proyectos. El asistente de Telegram lo usa con `~/carlos/bin/proyectos.py`. Decisión: D-63.

## Cómo funciona

- El bot es un **usuario aparte** ("Bot Lucuma"), administrador de la cuenta para ver todos los
  proyectos. Lo que hace figura con su nombre en la actividad ("Bot Lucuma creó la tarea…") y
  los avisos (asignaciones, etc.) les llegan a las personas igual que si lo hubiera hecho alguien.
- Entra con una **clave de API** (`lpm_…`), nunca con contraseña. La clave **solo** sirve en
  `/api/v1/bot/*`: el resto de la API la ignora, así que el bot no puede tocar personas,
  exportar, papelera ni contraseñas aunque sea administrador.
- No cuenta para el límite de usuarios del plan. En Personas aparece como "Bot (integración por API)".
- Se guarda solo la huella de la clave. Revocar es inmediato.

## Crear el bot y la clave (Plesk → Run script)

| Comando | Qué hace |
|---|---|
| `bot:prod -- crear lucuma "Bot Lucuma"` | Crea el bot en la cuenta `lucuma` e imprime su clave (UNA vez) |
| `bot:prod -- clave lucuma "telegram"` | Otra clave para el mismo bot |
| `bot:prod -- lista lucuma` | Claves (solo el inicio), último uso, revocadas |
| `bot:prod -- revocar lpm_ab12cd` | Revoca la clave con ese inicio |

## Rutas

Todas con el encabezado `Authorization: Bearer lpm_…`. No hace falta indicar la cuenta: la
clave ya la dice. Los errores responden `{ "error": "mensaje para mostrar" }`.

Proyectos y personas se pueden nombrar como en un chat: un proyecto por su id o por parte del
nombre sin importar tildes ("fenix google" → "Fénix · Google Ads"); una persona por correo o por
nombre ("carlos"). Si el nombre coincide con varios, responde **409** con las opciones, para que
el bot pregunte.

| Método y ruta | Para qué |
|---|---|
| `GET /api/v1/bot/yo` | Probar la clave: nombre del bot, cuenta, zona horaria |
| `GET /api/v1/bot/proyectos` | Proyectos activos con cuántas tareas pendientes tienen |
| `POST /api/v1/bot/proyectos` | Crear proyecto: `{ nombre, descripcion? }`. Si ya hay uno activo con ese nombre (sin tildes ni mayúsculas), devuelve ese con `existia: true` |
| `GET /api/v1/bot/personas` | El equipo (nombre, correo, rol), para asignar |
| `GET /api/v1/bot/tareas` | Tareas. Filtros: `cuando=hoy\|manana\|semana\|vencidas\|todas`, `proyecto=`, `responsable=`, `completadas=1`, `limite=` (máx. 200) |
| `POST /api/v1/bot/tareas` | Crear: `{ proyecto, titulo, lista?, vence?: "AAAA-MM-DD", responsables?: [..], notas? }`. Sin `lista`, va a la primera del proyecto; si la lista nombrada no existe, se crea |
| `POST /api/v1/bot/tareas/:id/completar` | Completar |
| `POST /api/v1/bot/tareas/:id/reabrir` | Reabrir |
| `GET /api/v1/bot/plantillas` | Plantillas de lista (D-64), con cuántas tareas tienen y cuántas son del cliente |
| `POST /api/v1/bot/plantillas` | Crear una plantilla, o reemplazarla entera si ya hay una con ese nombre (sin tildes ni mayúsculas): `{ nombre, descripcion?, tareas: [{ titulo, para?: "equipo"\|"cliente"\|"cualquiera", dia?, notas?, espera?: <n.º de una tarea anterior>, pide?: [{ nombre, tipo: "texto"\|"parrafo"\|"archivo"\|"enlaces"\|"acceso", obligatorio?, ayuda? }] }] }`. Desde el asistente: `proyectos.py cargar-plantilla archivo.json` |
| `POST /api/v1/bot/plantillas/aplicar` | Agregar una plantilla a un proyecto: `{ proyecto, plantilla, inicio?: "AAAA-MM-DD", responsable?, lista? }`. Ambos por nombre. Las tareas del equipo van al `responsable` (sin él quedan sin asignar: el bot no se las asigna); las del cliente, a los clientes del proyecto. Devuelve la lista creada y su `enlace` |

Cada tarea devuelve `id`, `titulo`, `proyecto`, `lista`, `vence`, `vencida`, `completada`,
`responsables` y `enlace` (abre la tarea en la app). "Hoy" se calcula en la zona horaria de la
cuenta (America/Lima).

## Ejemplos

```bash
CLAVE=lpm_...
API=https://proyectos.pruebalucuma.site/api/v1/bot

# ¿Qué tiene Carlos para hoy? ¿Qué está vencido?
curl -s -H "Authorization: Bearer $CLAVE" "$API/tareas?cuando=hoy&responsable=carlos"
curl -s -H "Authorization: Bearer $CLAVE" "$API/tareas?cuando=vencidas"

# "Agrega en Fénix: revisar títulos para el lunes, a Carlos"
curl -s -H "Authorization: Bearer $CLAVE" -H 'content-type: application/json' \
  -d '{"proyecto":"fenix google","titulo":"Revisar títulos","vence":"2026-10-26","responsables":["carlos"]}' \
  "$API/tareas"

# "Arranca el onboarding de Flecha Taxi el lunes"
curl -s -H "Authorization: Bearer $CLAVE" -H 'content-type: application/json' \
  -d '{"proyecto":"flecha taxi","plantilla":"onboarding","inicio":"2026-10-26","responsable":"carlos"}' \
  "$API/plantillas/aplicar"

# Completar
curl -s -X POST -H "Authorization: Bearer $CLAVE" "$API/tareas/<id>/completar"
```
