# 09. Avance

Bitácora con fecha y tema. Todo lo nuevo se anota aquí. Esta es la **única lista de
pendientes** del proyecto.

## Estado por día del plan

| Día | Tema | Estado |
|---|---|---|
| 1 | Monorepo, Postgres local, schema, migraciones con RLS, roles | ✅ 2026-10-24 |
| 2 | Contexto de cuenta por petición, subdominio, test de aislamiento | ✅ 2026-10-24 |
| 3 | Login, sesiones, selector de cuenta | ✅ 2026-10-24 |
| 4 | Invitaciones, personas, planes, soporte en beta, sistema visual del CRM | ✅ 2026-10-24 |
| 5 | Proyectos y servicio genérico de elementos | ✅ 2026-10-24 |
| 6 | Editor Tiptap | Siguiente |
| 7 | Tareas | Pendiente |
| 8 | Comentarios, menciones, suscripciones | Pendiente |
| 9 | Mensajes y actividad | Pendiente |
| 10 | Archivos | Pendiente |
| 11 | Bandeja de notificaciones | Pendiente |
| 12 | Recordatorios dentro de la app | Pendiente |
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

### 2026-10-24 · Día 3

Hecho:

- API de acceso (`routes/auth.ts`): enlace mágico, canje, contraseña, sesión, salir y cambio
  de contraseña. Detalle en [03-ARQUITECTURA.md](03-ARQUITECTURA.md#acceso-login).
- `lib/correo.ts` (nodemailer 7; buzón en tests, consola en desarrollo, SMTP en producción),
  `lib/password.ts` (copiado del CRM), `lib/freno.ts`, `lib/auditoria.ts`, cookie en `lib/sesion.ts`.
- La API solo acepta JSON.
- Script `cuenta:crear` (adelantado del día 4).
- Web: React Router y cinco pantallas (Entrar, Canjear, Cuentas, Portada, Mi cuenta), estilos
  provisionales con modo oscuro, subdominios locales con `lvh.me`.

Probado:

- 57 tests en verde (14 nuevos de acceso). CI del día 2 en verde en GitHub (38 s).
- Flujo completo contra la base de desarrollo por el proxy de la web: crear cuenta → pedir
  enlace → canjear → `/yo` como dueño → el mismo enlace no sirve dos veces → salir invalida la sesión.
- Recorrido en navegador real (Chromium sin ventana) en escritorio (1280 px) y celular (390 px):
  entrar con contraseña errada y correcta, portada, Mi cuenta, cuenta inexistente y salir. Sin
  errores de JavaScript. Capturas en [capturas/](capturas/).
- Corregido tras mirar las capturas: el enlace "Mi cuenta" salía subrayado y los demás no.

Notas:

- La cuenta local de desarrollo es `lucuma` con `dev@lucumaagency.com` (solo existe en la base
  de esta máquina). Si se pierde la contraseña: `npm run cuenta:crear` no sirve (la cuenta ya
  existe); entrar por enlace (sale en la consola de la API) y definirla en Mi cuenta.
- El Chrome del sistema no funciona con Playwright 1.48 (ya no acepta `--headless=old`); se usa
  el Chromium que Playwright tiene descargado en `~/.cache/ms-playwright`.

### 2026-10-24 · Respuestas del usuario a C-1 … C-7

| # | Respuesta | Qué cambió |
|---|---|---|
| C-1 | Está bien (carpeta renombrada) | Nada |
| C-2 | "Deberíamos poder hacerlo mientras estamos en beta" | Soporte entra a cualquier cuenta como admin, con registro (D-31) |
| C-3 | Preguntó qué significa | Explicado en el chat; queda abierta con una recomendación (ver abajo) |
| C-4 | "Branding como el del CRM" | Mismo sistema visual del CRM (D-33) |
| C-5 | "Que se cree la cuenta desde el comando de node" | Contraseña primero; `cuenta:crear` genera e imprime la contraseña del dueño (D-32) |
| C-6 | Sí | Se queda: una persona sin cuentas entra y ve un aviso |
| C-7 | "No vamos a tener correos por ahora; las invitaciones se comparten manualmente" | Sin correo en el MVP; invitaciones por enlace para copiar (D-32). Día 12 en espera |

### 2026-10-24 · Día 4

Hecho:

- **Invitaciones por enlace** (`routes/invitaciones.ts`): crear (devuelve el enlace), renovar,
  anular, ver y aceptar. Persona nueva crea nombre y contraseña; persona existente acepta con
  su sesión. Cliente a un proyecto: al aceptar queda como miembro de ese proyecto. Reglas en D-34.
- **Personas** (`routes/personas.ts`): lista con invitaciones pendientes y uso del plan;
  cambiar rol, desactivar y reactivar (D-36).
- **Planes:** `planPermite()` en `shared/planes.ts` (el `can()` del plan) y `lib/plan.ts` para
  contar el uso. Límite de usuarios aplicado al invitar, aceptar, pasar a equipo y reactivar (D-35).
- **Soporte en beta** (D-31): entra a cualquier cuenta como admin, lista de cuentas en el
  selector, franja en la web, registro `soporte.acceso`. `SOPORTE_BETA=0` lo apaga.
- **Sin correo** (D-32): login con contraseña; el enlace al correo solo aparece si hay SMTP.
- Migración `invitaciones_soporte`: funciones `invitacion_por_token()` y `cuentas_para_soporte()`.
- Consola: `cuenta:crear` genera la contraseña del dueño nuevo; nuevo `npm run usuario -- clave|soporte`.
- Orden interno: `lib/acceso.ts` (abrir sesión), `lib/enlaces.ts` (URLs compartibles),
  `lib/validar.ts`; `MIN_LARGO_PASSWORD` y reglas de invitación en `shared`.
- **Web con el sistema visual del CRM** (D-33): menú lateral (cajón en celular), barra superior,
  tarjetas de acceso, pantallas Personas e Invitación, modal con el enlace para copiar, copiar
  mensaje y abrir en WhatsApp. Favicon "LA", Montserrat.

Probado:

- 88 tests en verde (31 nuevos: 23 de invitaciones, personas, plan y soporte; 6 de planes; 2
  de aislamiento de las funciones nuevas). Tipos sin errores. `prisma migrate diff`: sin diferencias.
- Recorrido en navegador real, escritorio (1280 px) y celular (390 px): entrar con contraseña →
  selector con la sección de soporte → Inicio → Personas → invitar a un cliente → copiar el
  enlace → en otro navegador sin sesión abrir el enlace, crear la contraseña y entrar como
  cliente (su menú solo muestra Inicio) → el mismo enlace ya no sirve → entrar a otra cuenta
  como soporte con la franja. Sin errores de JavaScript (solo los 401 esperados antes de entrar).
- Medido: ninguna pantalla tiene scroll horizontal a 390, 820 ni 1280 px.

Problemas encontrados y cómo se resolvieron:

| Problema | Causa | Solución |
|---|---|---|
| Se podía pasar el límite de usuarios cambiando a alguien de cliente a equipo | Al cambiar de rol no se contaban las invitaciones pendientes | Se cuentan, igual que al invitar (lo detectó un test) |
| La etiqueta "PROYECTOS" se salía del menú lateral | Es más larga que "CRM" | Menú de 256 px y wordmark de 16 px en el lateral |
| La columna "Último acceso" desalineaba la tabla en escritorio | La clase `solo-escritorio` ponía `display: block` a una celda | `display: table-cell` para celdas; en celular se oculta |
| La pantalla de entrar decía que el administrador puede dar otra contraseña | No es así: solo soporte, por consola | Texto corregido |

Notas:

- En la base local quedaron la cuenta `demo-cliente` (dueña `demo@agencia.test`) y dos clientes
  de prueba en `lucuma`; `dev@lucumaagency.com` es soporte. Solo existen en esta máquina.
- Capturas en [capturas/](capturas/) (`dia4-*`).

### 2026-10-24 · Respuestas del usuario a C-3 y C-8 … C-11

| # | Respuesta | Qué cambió |
|---|---|---|
| C-3 | Sí, que se renueve con el uso | Hecho: la sesión vence tras 30 días sin entrar (D-37). 3 tests nuevos, 91 en total |
| C-8 | "Claro que sea dentro de la app" | El día 12 pasa a recordatorios en la bandeja (D-38) |
| C-9 | Lo de hoy está bien | Soporte sigue con permisos de admin (D-39) |
| C-10 | Hoy | Enlace de invitación: 7 días, un uso (D-39) |
| C-11 | Hoy | Contraseña olvidada: la restablece soporte por consola (D-39) |

### 2026-10-24 · Día 5

Hecho:

- **Permisos** (`services/permisos.ts`): `puede()` puro y `exigir()` con 404 para lo que no se ve (D-40).
- **Proyectos** (`routes/proyectos.ts`, `services/proyectos.ts`): listar por estado, crear,
  detalle con personas, secciones y permisos, editar, archivar/reactivar, papelera/restaurar,
  sumar y quitar personas; límite de proyectos del plan (D-41).
- **Elementos genéricos** (`routes/elementos.ts`, `services/elementos.ts`): crear, listar,
  ver, editar, papelera, restaurar y papelera del proyecto, para todos los tipos; reglas de
  padres; visibilidad en cadena para clientes (D-42).
- **Actividad** (`services/eventos.ts`): cada cambio de proyecto o elemento escribe su evento
  en la misma transacción.
- **Web:** Proyectos (pestañas Activos, Archivados y Papelera, tarjetas, nuevo proyecto) y la
  página del proyecto (acciones, personas con sumar/quitar e invitar cliente al proyecto, y las
  secciones Tareas, Mensajes y Archivos, todavía vacías).

Probado:

- 109 tests en verde (18 nuevos en `proyectos.test.ts`). Tipos sin errores.
- Sabotaje: con el filtro de visibilidad para clientes quitado a propósito, fallan 3 tests.
- Recorrido en navegador real, escritorio y celular: crear proyecto → personas → invitar a un
  cliente al proyecto → en otro navegador el cliente acepta y ve **solo** ese proyecto, sin menú
  de acciones → archivar (aviso de solo lectura) → reactivar. Sumar y quitar una persona:
  2 → 3 → 2. Sin errores de JavaScript ni scroll horizontal.

Problemas encontrados y cómo se resolvieron:

| Problema | Causa | Solución |
|---|---|---|
| Crear dentro de algo interno respondía 403 a un cliente (revelaba que existe) | `exigir()` no miraba si el padre se ve | Mira el padre: ahora 404 (lo detectó un test) |
| Capturas que se colgaban | Esperaban las fuentes de Google, que a veces tardan | Reintentos en el script de capturas (no afecta a la app) |

Notas:

- En la base local quedaron varios proyectos "Web Proba …" y clientes de prueba del recorrido.
- Capturas en [capturas/](capturas/) (`dia5-*`).

## Para confirmar

Decisiones que tomé con un criterio por defecto para no frenar el avance. Se pueden cambiar;
si no hay comentario, quedan así. Las respondidas están en la bitácora.

| # | Tema | Lo que hice | Alternativa |
|---|---|---|---|
| C-12 | Quién archiva o manda a la papelera un proyecto | Dueño, administrador o quien lo creó | Cualquiera del equipo del proyecto |
| C-13 | Editar o borrar tareas y mensajes de otros | Solo dueño y administrador (como decía el plan) | **Recomendado para tareas:** que todo el equipo del proyecto pueda editar las tareas de otros (renombrar, cambiar fecha), como en Basecamp. Mensajes y comentarios siguen siendo solo de su autor |
| C-14 | Lo que ve el cliente de la gente del proyecto | Nombres y rol, sin correos | Ver también los correos |

## Pendientes

### MVP (en orden)

- [ ] Días 5 a 15 según [07-PLAN-MVP.md](07-PLAN-MVP.md).
- [ ] Antes del día 15: contratar el servidor Vultr, crear el bucket R2, cuenta de Sentry, dominio de la app.

### Decisiones abiertas

- [ ] Nombre y marca del producto (hoy: "Lucuma Agency · Proyectos", D-33).
- [ ] Dominio de la app (para subdominios por cuenta).
- [ ] Precios y planes reales (hoy son de ejemplo en `planes.ts`).
- [ ] Cuándo se activa el correo (remitente y dominio para Brevo).

### Antes de la fase 2

- [ ] Iniciar el trámite con Meta para WhatsApp (número, verificación, plantillas) mientras se usa el MVP.
