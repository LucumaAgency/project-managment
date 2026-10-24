# 03. Arquitectura

## Stack

| Capa | Elección | Estado |
|---|---|---|
| API | Node 20/22 + TypeScript + Fastify 5 | Instalado (día 1) |
| Web | React 18 + Vite 5 (SPA), shadcn/ui, TanStack Query, React Router | React + Vite instalados; shadcn al llegar a pantallas |
| Base de datos | PostgreSQL 16 + Prisma 6.19 | Instalado y migrado (día 1) |
| Cola de trabajos | Tabla `jobs` + worker con `FOR UPDATE SKIP LOCKED` | Modelo creado; worker en semana 3 |
| Editor de texto | Tiptap + extensión Mention | Día 6 |
| Archivos | Cloudflare R2, URL firmada, subida con Uppy | Día 10 |
| Miniaturas | sharp (imágenes) + pdftoppm (PDF), en job | Día 10 |
| Correo | Brevo | Día 12 |
| Errores | Sentry | Día 15 |
| Hosting | Vultr + CloudPanel, cron real | Día 15 |
| Postgres local | `embedded-postgres` (solo desarrollo) | Instalado (día 1) |

Monorepo con npm workspaces, igual que el CRM:

```
packages/shared   tipos y reglas compartidas (roles, planes)
packages/api      servidor Fastify
packages/web      SPA React; build a /public, que sirve la API
prisma/           schema y migraciones
scripts/          utilidades (db-local.mjs)
```

Se reutiliza del CRM: login (enlace mágico + contraseña scrypt), manejo de `.env`, manejador
de errores, patrón de cola y worker, envío por Brevo, multi-cuenta por subdominio.

## Modelo de datos

Archivo: [`prisma/schema.prisma`](../prisma/schema.prisma).

```
Account ──< Membership >── User (global)
   │
   ├──< Invitation
   ├──< Project ──< ProjectMember >── User
   │       │
   │       └──< Recording  (todolist · todo · message · folder · upload · comment)
   │               ├── parent / children     tarea → lista, comentario → lo comentado
   │               ├── TodoDetail             fecha, completada
   │               ├── TodoAssignee           responsables
   │               ├── UploadVersion ── Blob  versiones del archivo (R2)
   │               ├── RecordingAttachment ── Blob   imágenes pegadas en el texto
   │               ├── Mention, Subscription
   │               └──< Event ──< Notification
   ├── Blob
   └── AuditLog
User ──< LoginToken, Session
Job (infraestructura, sin cuenta obligatoria)
```

### Tres ideas que sostienen el modelo

1. **Account es la agencia.** Toda tabla con datos de clientes lleva `accountId`, y la base
   bloquea el acceso entre cuentas (ver Aislamiento).
2. **User es global.** Un correo es una persona; entra a cada cuenta por `Membership` con un
   rol. Si al principio el usuario colgara de una sola cuenta, pasar a varias cuentas después
   costaría semanas.
3. **Recording es todo lo que vive en un proyecto.** Es el patrón que usa Basecamp. Una tabla
   base con los campos comunes (título, cuerpo, creador, visibilidad, estado, posición, padre) y
   tablas de detalle 1 a 1 solo para lo propio de cada tipo. Comentarios, menciones, papelera,
   actividad, suscripciones y visibilidad se programan **una vez** y sirven para todo.

### Campos y convenciones

- IDs `cuid()`. Tablas en plural con `@@map` (`recordings`, `project_members`); columnas en
  camelCase, como el CRM.
- Cuerpo de texto en tres formas: `body` (JSON de Tiptap, la fuente), `bodyHtml` (sanitizado en
  el servidor, para mostrar y para correos) y `bodyText` (plano, para búsqueda y previews).
- `position` es Float: para insertar entre dos elementos se usa el promedio, sin renumerar.
- Fechas de tareas como `@db.Date` (día sin hora). Todo lo demás en UTC.
- `Blob.storageKey` = `<accountId>/<yyyy>/<mm>/<cuid>`; nunca el nombre original del archivo.
- `Account.plan` + `Account.limits` (excepciones por cuenta). Catálogo en
  `packages/shared/src/planes.ts`.

## Aislamiento entre cuentas (RLS)

Es la decisión técnica más importante para venderlo: una agencia nunca debe ver datos de otra,
aunque el código tenga un error.

**Dos roles de base de datos:**

| Rol | Uso | Row Level Security |
|---|---|---|
| `pm_app` | La API en cada petición | Aplica: solo ve la cuenta fijada |
| `pm_admin` | Migraciones, worker que recorre cuentas, scripts, superadmin | No aplica (BYPASSRLS, dueño de las tablas) |

**Cómo se fija la cuenta:** cada petición corre en una transacción que empieza con
`set_config('app.account_id', …, true)` y `set_config('app.user_id', …, true)`. Las políticas
comparan `accountId` con esa variable. Sin variable no se ve ninguna fila.

**Políticas** (migración `rls_busqueda`):

- Tablas con `accountId`: lectura y escritura solo en la cuenta activa; insertar en otra cuenta
  da error.
- `accounts`: solo la activa.
- `memberships`: se leen las de la cuenta activa **y las propias en cualquier cuenta** (para el
  selector de cuenta tras el login); se escriben solo en la activa.
- `audit_log`: se puede escribir sin cuenta (intentos de login), pero esas filas solo las lee
  `pm_admin`.
- Tablas de detalle sin `accountId` (`todo_details`, `upload_versions`,
  `recording_attachments`): heredan de su recording.
- Sin RLS a propósito: `users`, `login_tokens`, `sessions` (el login ocurre antes de saber la
  cuenta) y `jobs`.

**Antes de saber la cuenta** hay dos consultas que RLS no dejaría hacer, resueltas con
funciones `SECURITY DEFINER` (migración `resolver_cuenta`) que devuelven columnas mínimas:

- `cuenta_por_slug(slug)`: traduce el subdominio a la cuenta (id, nombre, plan, zona horaria,
  idioma, si está cerrada).
- `cuentas_de_usuario()`: las cuentas activas de la persona fijada en `app.user_id`, con su rol
  (selector de cuenta tras el login).

**Contexto por petición** (`plugins/contexto.ts`): un hook resuelve en cada petición la cuenta
(subdominio en producción; `?cuenta=` o encabezado `X-Cuenta` solo si no hay `BASE_DOMAIN`),
el usuario (cookie `pm_sesion`, en la base solo el hash SHA-256) y su membresía. No corta
nada; cada ruta exige lo suyo:

| Función | Exige | Respuestas |
|---|---|---|
| `exigirUsuario(req)` | sesión válida | 401 |
| `exigirCuenta(req)` | cuenta indicada, existente, abierta, sesión y membresía activa | 400, 404, 410, 401, 403 |

`exigirCuenta` devuelve el `ctx` que se pasa a `conCuenta(ctx, tx => …)` (`lib/contexto.ts`),
la única forma en que la app toca datos de una cuenta. `conUsuario(userId, …)` fija solo el
usuario, para el selector de cuentas.

**Dos capas:** RLS cuida la frontera entre cuentas. Dentro de una cuenta, la función
`puede(ctx, accion, recording)` de `services/permisos.ts` decide por proyecto, rol y
visibilidad. Las rutas no deciden permisos por su cuenta.

## Acceso (login)

La persona es global: entra una sola vez y elige cuenta. Rutas en `routes/auth.ts`:

| Ruta | Qué hace |
|---|---|
| `POST /api/v1/auth/enlace` | Envía un enlace mágico (20 min, un uso). Misma respuesta exista o no el correo |
| `POST /api/v1/auth/canjear` | Canjea el token por una sesión. Se marca usado en el mismo paso que se valida |
| `POST /api/v1/auth/entrar` | Correo y contraseña (scrypt). Mismo error y mismo tiempo para todo fallo |
| `GET /api/v1/auth/sesion` | Quién soy y mis cuentas (selector) |
| `POST /api/v1/auth/salir` | Borra la fila de la sesión y la cookie |
| `POST /api/v1/auth/password` | Define o cambia la contraseña; cierra las otras sesiones |
| `GET /api/v1/config` | Dominio base, para que la web arme los enlaces entre cuentas |

- **Cookie** `pm_sesion`: HttpOnly, SameSite=Lax, Secure en producción, 30 días. Con dominio
  base va a `.dominio`, así una sesión sirve para todas las cuentas de la persona.
- **Enlace del correo:** se arma solo con el dominio configurado (o `APP_URL`), nunca con el
  Host de la petición. Si no, alguien podría pedir el enlace de otra persona con un Host falso
  y recibir su token en su propio sitio (lo prueba un test).
- **Frenos:** 5 contraseñas fallidas por IP y correo cada 15 min (429); 3 enlaces por correo
  y 20 por IP cada 15 min (se responde igual, sin enviar).
- **Solo JSON:** la API no acepta `text/plain`, para que un formulario de otro sitio no pueda
  mandar un POST sin preflight.
- **Auditoría:** `user.login` (con método), `user.login_fallido`, `user.password` en `audit_log`
  sin cuenta.
- **Correo:** `lib/correo.ts`. En tests va a un buzón en memoria; sin `SMTP_HOST` en desarrollo
  se imprime en consola con sus enlaces; en producción sale por SMTP (Brevo) y sin SMTP no
  arranca el envío. Los correos de acceso salen en la misma petición; los demás irán por la cola.

## Web

SPA React con React Router (`packages/web`). Pantallas al día 3: Entrar (enlace o contraseña),
Canjear enlace, Selector de cuentas, Portada de la cuenta, Mi cuenta (contraseña). Estilos
provisionales en `estilos.css` con tokens de color y modo oscuro (marca pendiente, C-4).

- En producción la cuenta sale del subdominio; en local, de `?cuenta=` y se guarda en
  `sessionStorage` para mandarla en `X-Cuenta`.
- En local también se pueden usar subdominios reales con `BASE_DOMAIN=lvh.me`
  (`lucuma.lvh.me:5174`; `lvh.me` apunta a 127.0.0.1).

## Visibilidad para clientes

Lógica en `services/visibilidad.ts`:

- Un hijo nunca es más visible que su padre: al consultar, un cliente ve un elemento solo si
  él y toda su cadena de padres son visibles.
- Lo que crea un cliente nace visible.
- Un comentario copia la visibilidad de lo que comenta.
- `Event.visibleToClients` se copia al crear el evento, para filtrar el feed del cliente sin
  recalcular.
- Correos, bandeja y búsqueda pasan por el mismo filtro.

## Actividad y notificaciones

```
cambio del usuario ──(misma transacción)──> Event
                                              │
                                   job notify.fanout
                                              │
              ┌───────────────────────────────┼─────────────────────┐
         mencionados                     asignados           suscriptores
              └──────────────> Notification (una por persona) <─────┘
                                              │
                   inmediato (mención/asignación) → job email.send
                   resto → job digest.daily (por zona horaria)
```

- El evento se escribe en la misma transacción que el cambio: si el cambio se guarda, su
  evento también.
- Las notificaciones se generan fuera de la petición (job), para no hacer lenta la respuesta.
- Nadie recibe aviso de su propia acción.
- `Notification.emailedAt` evita mandar dos veces lo mismo.

## Cola de trabajos

- Tabla `jobs` (tipo, payload, estado, intentos, `runAt`, bloqueo). Mismo patrón que el CRM.
- El worker toma lotes con `FOR UPDATE SKIP LOCKED`: varios workers no toman el mismo job.
- Reintentos con espera creciente (1 min, 5 min, 15 min, 1 h, 6 h, 24 h).
- Si el job tiene `accountId`, el worker fija esa cuenta antes de ejecutarlo; los que recorren
  cuentas (resumen diario, purgas) usan `pm_admin`.
- Lo dispara un cron real en el servidor (Vultr + CloudPanel). En Plesk el cron no funcionaba
  y fue un problema del CRM; por eso el hosting cambia.
- Tipos previstos: `email.send`, `notify.fanout`, `digest.daily`, `due.reminders`,
  `blob.preview`, `trash.purge`, `account.export`, `account.purge`.

## Archivos

```
navegador ── pide subir ──> API: valida permiso y cuota, crea Blob(pending), firma URL de R2
navegador ── sube directo ──> R2 (el archivo no pasa por el servidor)
navegador ── confirma ──> API: Blob(ready), crea UploadVersion o adjunto, encola blob.preview
worker ── blob.preview ──> miniatura en R2, Blob.previewKey
```

- Descargas con URL firmada que vence.
- La cuota del plan se calcula sumando `Blob.byteSize` de la cuenta.

## Búsqueda

- Columna `recordings.search` (tsvector): título con peso A y texto con peso B, configuración
  `simple` (el contenido mezcla español, inglés y nombres propios).
- La mantiene un **trigger**, no una columna calculada (motivo en [04](04-DECISIONES.md), D-13).
- Índice GIN. Consulta: `WHERE search @@ plainto_tsquery('simple', $1)`.
- RLS aplica también a la búsqueda (probado).

## Seguridad

- Contraseñas con scrypt; enlace mágico de un solo uso que vence.
- Sesión en cookie; en la base solo el hash del token.
- Límite de peticiones en login e invitaciones.
- HTML del editor sanitizado en el servidor; menciones extraídas en el servidor (no se confía
  en lo que manda el navegador).
- Secretos de desarrollo rechazados en producción (`reqEnProduccion` en `env.ts`).
- Errores internos no se muestran al navegador.
- Respaldo diario de la base y de R2.
- `AuditLog` para logins, cambios de rol, invitaciones, exportaciones y entradas de soporte.
