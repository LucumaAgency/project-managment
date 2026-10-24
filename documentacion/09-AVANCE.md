# 09. Avance

Bitácora con fecha y tema. Todo lo nuevo se anota aquí. Esta es la **única lista de
pendientes** del proyecto.

## Estado por día del plan

| Día | Tema | Estado |
|---|---|---|
| 1 | Monorepo, Postgres local, schema, migraciones con RLS, roles | ✅ 2026-10-24 |
| 2 | Contexto de cuenta por petición, subdominio, test de aislamiento | Siguiente |
| 3 | Login, sesiones, selector de cuenta | Pendiente |
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
