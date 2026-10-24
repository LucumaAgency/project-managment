# 09. Avance

Bitácora con fecha y tema. Todo lo nuevo se anota aquí. Esta es la **única lista de
pendientes** del proyecto.

## Estado por día del plan

| Día | Tema | Estado |
|---|---|---|
| 1 | Monorepo, Postgres local, schema, migraciones con RLS, roles | ✅ 2026-10-24 |
| 2 | Contexto de cuenta por petición, subdominio, test de aislamiento | ✅ 2026-10-24 |
| 3 | Login, sesiones, selector de cuenta | En curso |
| 4 | Invitaciones, alta de cuenta por script, planes | Pendiente |
| 5 | Proyectos y servicio genérico de elementos | Pendiente |
| 6 | Editor Tiptap | Pendiente |
| 7 | Tareas | Pendiente |
| 8 | Comentarios, menciones, suscripciones | Pendiente |
| 9 | Mensajes y actividad | Pendiente |
| 10 | Archivos | Pendiente |
| 11 | Bandeja de notificaciones | Pendiente |
| 12 | Correos, resumen diario, recordatorios | Pendiente |
| 13 | Vista del cliente | Pendiente |
| 14 | Papelera, búsqueda, celular, exportación | Pendiente |
| 15 | Servidor y salida a producción | Pendiente |

Detalle de cada día en [07-PLAN-MVP.md](07-PLAN-MVP.md).

## Bitácora

### 2026-10-24 · Planificación

Conversación de diseño con el usuario. En orden:

1. Qué tener en cuenta para un Basecamp propio: funcionalidad (MVP y segunda fase) y lo técnico
   (modelo de datos, permisos, tiempo real, jobs, correo, archivos, editor, búsqueda, papelera,
   seguridad).
2. Objetivo aclarado: **para vender, empezando por uso interno**. Se definieron las decisiones
   de SaaS que se toman desde el día 1 y las que esperan a la fase 3. Se estimaron tiempos con
   el ritmo del CRM como referencia.
3. Evaluación de alternativas open source y licencias: no hacer fork, usar librerías MIT.
4. Chat: se analizaron tres caminos (sin chat, chat simple, puente con WhatsApp).
5. WhatsApp: se diseñó la integración con la Cloud API.
6. **Decisión del usuario: MVP sin WhatsApp y sin chat.**
7. Diseño escrito: plan del MVP, schema Prisma y políticas RLS. Las políticas se probaron sobre
   el schema en PGlite (Postgres 16 en WebAssembly).
8. Subido a https://github.com/LucumaAgency/project-managment (commit `0b23739`). El usuario
   confirmó que el repo quede público.

### 2026-10-24 · Día 1 (commit `3fb3488`)

Hecho:

- Monorepo `packages/shared|api|web` con la estructura del CRM. Fastify 5, Prisma 6.19.3,
  React 18 + Vite 5.
- `packages/shared`: roles (`roles.ts`) y catálogo de planes con límites (`planes.ts`).
- `packages/api`: `env.ts` (carga `.env` por ruta explícita, rechaza secretos de desarrollo en
  producción), `db.ts` (clientes `prisma` con `pm_app` y `prismaAdmin` con `pm_admin`),
  manejador de errores y `GET /api/v1/salud`.
- `packages/web`: página mínima que consulta la salud de la API (proxy de Vite a la API).
- `scripts/db-local.mjs`: Postgres 16.14 embebido en `localhost:5433`, crea roles y base.
- Migraciones:
  1. `init`: todas las tablas del schema.
  2. `rls_busqueda`: permisos de `pm_app`, funciones de contexto, políticas por cuenta, columna
     de búsqueda.
  3. `busqueda_por_trigger`: la búsqueda pasa a trigger (D-13).
- Documentación de desarrollo (hoy [08-DESARROLLO.md](08-DESARROLLO.md)).

Probado:

- `prisma migrate diff` entre la base y el schema: sin diferencias.
- Con Prisma y el rol `pm_app`: sin cuenta fijada no ve ninguna fila; cada cuenta ve solo sus
  proyectos; la búsqueda solo devuelve resultados de la cuenta activa; crear un proyecto en otra
  cuenta lo rechaza Postgres (error 42501).
- Web → API → base: `/api/v1/salud` responde `{"ok":true,"postgres":"16.14","rol":"pm_app"}`
  directo y vía proxy de Vite.
- `npm run typecheck` sin errores en los tres paquetes.

Problemas encontrados y cómo se resolvieron:

| Problema | Causa | Solución |
|---|---|---|
| Postgres no arrancaba (`invalid locale settings`) | La máquina no tiene idioma del sistema configurado | `LC_ALL=C` + `initdb --locale=C --encoding=UTF8` en `db-local.mjs` |
| La segunda migración fallaba en la base temporal de Prisma | `REVOKE` sobre `_prisma_migrations`, que ahí no existe | `REVOKE` condicional con `to_regclass` |
| Prisma veía diferencias en `recordings.search` | Lee la columna `GENERATED` como valor por defecto | Columna común + trigger, en migración nueva (D-13) |
| `prisma migrate reset` bloqueado | Prisma no deja que una IA reinicie la base sin permiso del usuario | No se saltó el bloqueo: migración nueva en vez de reset |
| Un `migrate dev` quedó esperando | Pedía confirmación interactiva | Detenido; las comprobaciones se hacen con `migrate status` y `migrate diff` |

Notas:

- El comentario de la migración `rls_busqueda` menciona `docs/DESARROLLO.md`. Esa guía hoy es
  [08-DESARROLLO.md](08-DESARROLLO.md). No se corrige: modificar una migración aplicada cambia
  su checksum y Prisma la marcaría como alterada.
- Las migraciones de diseño de RLS se probaron dos veces: en PGlite (planificación) y en
  Postgres 16 real con Prisma (día 1).

### 2026-10-24 · Documentación

Se creó esta carpeta `documentacion/` con el plan completo y el avance. `docs/PLAN-MVP.md` y
`docs/DESARROLLO.md` pasaron a ser `07-PLAN-MVP.md` y `08-DESARROLLO.md`.

### 2026-10-24 · Carpeta local renombrada

A pedido del usuario, la carpeta local pasó de `~/lucuma-proyectos` a `~/project-management`
(mismo nombre que el repo). La documentación vive en `~/project-management/documentacion/`.
Se renombró en vez de copiar para no tener dos versiones que se desactualicen.

### 2026-10-24 · Día 2

Hecho:

- `lib/contexto.ts`: `conCuenta(ctx, fn)` y `conUsuario(userId, fn)`.
- `lib/host.ts`: cuenta desde el subdominio (raíz, reservados, ajenos).
- `lib/sesion.ts`: sesiones con token aleatorio en cookie `pm_sesion` y hash SHA-256 en la base.
- `lib/cuenta.ts` + migración `resolver_cuenta`: `cuenta_por_slug()` y `cuentas_de_usuario()`.
- `plugins/contexto.ts`: hook por petición + `exigirUsuario` / `exigirCuenta`.
- Rutas `GET /api/v1/yo` y `GET /api/v1/mis-cuentas`.
- `shared/cuentas.ts`: slugs reservados y formato válido.
- Tests con Vitest y Postgres propio por corrida; CI en GitHub Actions.
- `scripts/pg-embebido.mjs`: lógica común de Postgres local y de tests.

Probado:

- 43 tests en verde (16 de aislamiento, 15 de HTTP, 12 de host).
- Sabotaje a propósito: con el RLS de `blobs` apagado, 4 tests fallan. Se quitó.
- `npm run typecheck` sin errores, incluidos los tests.

## Para confirmar

Decisiones que tomé con un criterio por defecto para no frenar el avance. Se pueden cambiar;
si no hay comentario, quedan así.

| # | Tema | Lo que hice | Alternativa |
|---|---|---|---|
| C-1 | Carpeta local | Renombré `~/lucuma-proyectos` a `~/project-management` (con la documentación dentro) | Una carpeta aparte solo con copia de los documentos |
| C-2 | Soporte de Lucuma | Sin membresía no entra a ninguna cuenta (403), hasta el superadmin | Darle acceso de lectura desde ya |
| C-3 | Duración de la sesión | 30 días | Más corta (7 días) o "recordarme" opcional |

## Pendientes

### MVP (en orden)

- [ ] Día 2: `conCuenta()`, hook de contexto por subdominio y sesión, test automático A/B de aislamiento.
- [ ] Días 3 a 15 según [07-PLAN-MVP.md](07-PLAN-MVP.md).
- [ ] Elegir un sistema de tests (vitest) y un CI en GitHub Actions que corra el test de aislamiento siempre (el CRM no tiene tests; aquí sí desde el día 2).
- [ ] Antes del día 15: contratar el servidor Vultr, crear el bucket R2, cuenta de Sentry, dominio de la app.

### Decisiones abiertas

- [ ] Nombre y marca del producto.
- [ ] Dominio de la app (para subdominios por cuenta).
- [ ] Precios y planes reales (hoy son de ejemplo en `planes.ts`).

### Antes de la fase 2

- [ ] Iniciar el trámite con Meta para WhatsApp (número, verificación, plantillas) mientras se usa el MVP.
