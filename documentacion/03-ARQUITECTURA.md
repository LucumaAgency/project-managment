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
| Hosting | Plesk en la beta (D-43, guía en 10-DESPLIEGUE-PLESK.md); Vultr + CloudPanel con cron real después | Desde ya |
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
| `pm_admin` | Migraciones, worker que recorre cuentas, scripts, superadmin | No aplica: es el **dueño** de las tablas y las tablas no tienen FORCE (D-44). Sin BYPASSRLS ni superusuario |

**Por qué `pm_app` no puede saltarse RLS:** no es superusuario, no tiene BYPASSRLS, no es
dueño de ninguna tabla y no es miembro de `pm_admin` (si lo fuera, heredaría el salto del
dueño: probado a propósito, pasa a ver todo). Lo comprueban un test y `base:verificar:prod`.

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
`puede(actor, accion, { proyecto, elemento })` de `services/permisos.ts` decide por proyecto,
rol y visibilidad (D-40). Las rutas no deciden permisos por su cuenta.

## Acceso (login)

La persona es global: entra una sola vez y elige cuenta. En el MVP **no hay correo** (D-32):
se entra con correo y contraseña. Rutas en `routes/auth.ts`:

| Ruta | Qué hace |
|---|---|
| `POST /api/v1/auth/entrar` | Correo y contraseña (scrypt). Mismo error y mismo tiempo para todo fallo |
| `POST /api/v1/auth/enlace` | Envía un enlace mágico (20 min, un uso). Misma respuesta exista o no el correo. **Sin SMTP en producción: 503**; la web no lo ofrece |
| `POST /api/v1/auth/canjear` | Canjea el token por una sesión. Se marca usado en el mismo paso que se valida |
| `GET /api/v1/auth/sesion` | Quién soy (incluye si soy soporte) y mis cuentas (selector) |
| `POST /api/v1/auth/salir` | Borra la fila de la sesión y la cookie |
| `POST /api/v1/auth/password` | Define o cambia la contraseña; cierra las otras sesiones |
| `GET /api/v1/config` | Dominio base y si hay correo saliente |

- **Contraseñas:** las del dueño las genera `cuenta:crear`; las de invitados las elige la
  persona al aceptar; si alguien la olvida, soporte genera otra con `npm run usuario -- clave`.
- **Cookie** `pm_sesion`: HttpOnly, SameSite=Lax, Secure en producción. Se renueva con el uso
  (D-37): vence tras 30 días sin entrar; se corre como mucho una vez al día en el hook de
  contexto, que repone la cookie. Con dominio base va a `.dominio`: una sesión sirve para todas
  las cuentas.
- **Enlaces** (correo e invitaciones, `lib/enlaces.ts`): se arman solo con el dominio
  configurado (o `APP_URL`), nunca con el Host de la petición. Si no, alguien podría hacer que
  el enlace de otra persona apunte a su sitio (lo prueba un test).
- **Frenos:** 5 contraseñas fallidas por IP y correo cada 15 min (429); 3 enlaces por correo
  y 20 por IP cada 15 min (se responde igual, sin enviar).
- **Solo JSON:** la API no acepta `text/plain`, para que un formulario de otro sitio no pueda
  mandar un POST sin preflight.
- **Auditoría:** `user.login` (con método: password, enlace o invitación), `user.login_fallido`,
  `user.password` en `audit_log` sin cuenta.
- **Correo:** `lib/correo.ts` queda listo para cuando se active: en tests va a un buzón en
  memoria; sin `SMTP_HOST` en desarrollo se imprime en consola; con SMTP sale por Brevo.

## Soporte de Lucuma (beta)

Durante la beta (`SOPORTE_BETA` distinto de `0`), una persona con `users.isStaff` entra a
cualquier cuenta abierta sin ser miembro, con rol **admin** (D-31).

- `exigirCuenta()` devuelve `soporte: true` y `/yo` también: la web muestra la franja ámbar.
- `GET /api/v1/soporte/cuentas` lista las cuentas abiertas (función `cuentas_para_soporte()`,
  SECURITY DEFINER, vacía si quien pregunta no es staff). El selector las muestra aparte.
- Cada entrada queda en `audit_log` de la cuenta como `soporte.acceso`, una vez por sesión.
- RLS no cambia: soporte trabaja con la cuenta fijada igual que cualquiera; no usa `pm_admin`.
- Si además es miembro de esa cuenta, entra con su rol de miembro, sin franja.

## Personas e invitaciones

Rutas en `routes/personas.ts` y `routes/invitaciones.ts`. Reglas en D-34, D-35 y D-36.

| Ruta | Quién | Qué hace |
|---|---|---|
| `GET /api/v1/personas` | todos menos clientes | Personas de la cuenta, invitaciones pendientes (el equipo ve solo las suyas), uso del plan y qué puede hacer quien pregunta |
| `PATCH /api/v1/personas/:id` | owner, admin | Rol, desactivar/reactivar, empresa |
| `POST /api/v1/invitaciones` | según rol | Crea la invitación y devuelve el **enlace** para compartir |
| `POST /api/v1/invitaciones/:id/renovar` | quien invitó, owner, admin | Enlace nuevo y 7 días más; el anterior deja de servir |
| `DELETE /api/v1/invitaciones/:id` | quien invitó, owner, admin | Anula |
| `POST /api/v1/invitacion/ver` | pública (token) | Qué cuenta, rol, proyecto, quién invita, si el correo ya tiene usuario |
| `POST /api/v1/invitacion/aceptar` | pública (token) | Persona nueva: nombre + contraseña y entra. Ya existente: con su sesión |

- El enlace es `<cuenta>/invitacion?token=…`. En la base solo va `sha256(token)`; por eso
  "renovar" genera otro en vez de mostrar el mismo.
- La invitación se lee antes de saber la cuenta con `invitacion_por_token(hash)` (SECURITY
  DEFINER, columnas mínimas). Sin el token no hay forma de listar invitaciones.
- Aceptar corre en **una** transacción con la cuenta fijada: crear la persona, marcar la
  invitación como usada, revisar el límite, crear o reactivar la membresía y sumarla al
  proyecto. Si algo falla, no queda una persona creada a medias.

## Planes y límites

`shared/planes.ts`: catálogo (`interno`, `prueba`, `estudio`, `agencia`), `planDe(plan,
limites)` que aplica las excepciones de `Account.limits` (solo claves conocidas con número o
null), y `planPermite(plan, consulta)`, el `can()` del plan: responde `{ ok }` o `{ ok: false,
motivo }` con el texto para mostrar. Un plan desconocido cae en `prueba` (lo más restrictivo).
Del lado del servidor, `lib/plan.ts` cuenta el uso con la cuenta fijada (`usuariosEnUso`,
`exigirCupoUsuarios`). Hoy se aplica a personas; proyectos (día 5) y almacenamiento (día 10)
usan la misma función.

## Web

SPA React con React Router (`packages/web`), con el sistema visual del CRM (D-33).

- **Sin cuenta** (tarjeta centrada, `PaginaAcceso`): Entrar, Canjear enlace, Selector de
  cuentas (con la sección de soporte), Invitación.
- **Dentro de una cuenta** (`Marco`: menú lateral, barra superior, franja de soporte):
  Proyectos (activos, archivados, papelera), Proyecto (cabecera, acciones, personas, secciones),
  Personas (clientes no la ven), Mi cuenta. `Marco` carga `/yo` una vez y lo comparte con
  `useYo()`.
- Componentes: `Icono` (trazos propios, sin librería), `Marca`, `Modal`, `EnlaceCompartir`.
- En producción la cuenta sale del subdominio; en local, de `?cuenta=` y se guarda en
  `sessionStorage` para mandarla en `X-Cuenta`.
- En local también se pueden usar subdominios reales con `BASE_DOMAIN=lvh.me`
  (`lucuma.lvh.me:5174`; `lvh.me` apunta a 127.0.0.1).

## Proyectos y elementos

Rutas en `routes/proyectos.ts` y `routes/elementos.ts`; la lógica, en `services/`:
`proyectos.ts` (cargar con permiso, cupo del plan), `elementos.ts` (crear, editar, papelera,
restaurar, listar, cadena de padres), `eventos.ts` (actividad) y `permisos.ts`. Reglas en D-41
y D-42.

| Ruta | Qué hace |
|---|---|
| `GET /api/v1/proyectos?estado=active\|archived\|trashed` | Los que puedo ver (papelera: owner/admin) |
| `POST /api/v1/proyectos` | Crear (quien crea queda dentro) |
| `GET /api/v1/proyectos/:id` | Detalle, personas, cuántos elementos por sección y mis permisos |
| `PATCH /api/v1/proyectos/:id` | Nombre y descripción |
| `POST /api/v1/proyectos/:id/archivar · reactivar · papelera · restaurar` | Cambios de estado |
| `POST /api/v1/proyectos/:id/personas` · `DELETE …/personas/:userId` | Sumar o quitar a alguien de la cuenta |
| `GET · POST /api/v1/proyectos/:id/elementos` | Hijos de un padre (`?padre=`, `?tipo=`) o de la raíz; crear |
| `GET · PATCH /api/v1/elementos/:id` | Ver (con mis permisos) y editar (título, texto, visibilidad, posición) |
| `POST /api/v1/elementos/:id/papelera · restaurar` | Papelera |
| `GET /api/v1/proyectos/:id/papelera` | Lo borrado del proyecto (owner/admin) |

Invitar a un cliente directo a un proyecto usa `POST /api/v1/invitaciones` con `projectId`.

## Texto con formato y menciones

- **Web:** `componentes/Editor.tsx` (Tiptap) con barra de formato, lista del @ y Ctrl+Enter;
  `Contenido` muestra el `bodyHtml` que devuelve la API. Solo se usa con HTML de la API.
- **API:** los elementos aceptan `body` (JSON del editor) o `bodyText` (texto plano, se
  convierte a párrafos). `lib/documento.ts` arma `bodyHtml` y `bodyText` y extrae las
  menciones (D-47); `services/menciones.ts` guarda solo las válidas (D-48).
- `GET /api/v1/proyectos/:id/mencionables[?interno=1]`: la lista del @.
- La búsqueda usa `bodyText`, así que encuentra también lo escrito con el editor.

## Visibilidad para clientes

Lógica en `services/elementos.ts` (cadena de padres) y `services/permisos.ts` (decisión):

- Un hijo nunca es más visible que su padre: al consultar, un cliente ve un elemento solo si
  él y toda su cadena de padres son visibles.
- Lo que crea un cliente nace visible.
- Un comentario copia la visibilidad de lo que comenta.
- `Event.visibleToClients` se copia al crear el evento, para filtrar el feed del cliente sin
  recalcular.
- Correos, bandeja y búsqueda pasan por el mismo filtro.
- Lo comprueban los tests de `proyectos.test.ts`; con el filtro quitado a propósito fallan 3.

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
