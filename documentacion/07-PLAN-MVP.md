# 07. Plan del MVP

> Parte de la [documentación](00-INDICE.md). Estado y pendientes: [09-AVANCE.md](09-AVANCE.md).

Herramienta tipo Basecamp para agencias, con portal de clientes. Primero la usa Lucuma; después se vende.
Fecha del plan: 2026-10-24. Nombre de trabajo; se cambia cuando haya marca.

## 1. Alcance del MVP

Entra:

1. Cuentas y roles (owner, admin, equipo, cliente), con invitaciones por enlace (el correo llega después)
2. Proyectos con sus miembros
3. Tareas: listas, responsable, fecha, completar, comentarios
4. Mensajes: anuncios o temas del proyecto
5. Archivos: subida directa a R2, vista previa, versiones
6. Comentarios y @menciones en todo
7. Notificaciones: bandeja y recordatorios dentro de la app (sin correo en el MVP, D-32 y D-38)
8. Vista del cliente: solo ve lo marcado como visible
9. Actividad y papelera (30 días)

Queda fuera: chat, WhatsApp, calendario, check-ins, aprobaciones, plantillas, búsqueda avanzada,
cobros, onboarding de prueba, app móvil.

**Listo cuando:** Lucuma maneja 2 o 3 proyectos reales de clientes ahí, sin coordinar por WhatsApp ni Drive.

## 2. Stack

| Pieza | Elección | Nota |
|---|---|---|
| API | Node 20 + TypeScript + Fastify | Igual que el CRM |
| Web | React + Vite (SPA), CSS propio con el sistema visual del CRM | Igual que el CRM (D-33) |
| Base | **PostgreSQL 16** + Prisma | Distinto del CRM (MariaDB): RLS y búsqueda |
| Cola | Tabla `jobs` + worker con `SKIP LOCKED` | Patrón del CRM. Sin Redis: sin chat no hay tiempo real |
| Editor | Tiptap (+ extensión Mention) | MIT |
| Archivos | Cloudflare R2 + URL firmada + Uppy | El archivo no pasa por el servidor |
| Miniaturas | sharp (imágenes) + pdftoppm (PDF) en job | |
| Correo | Brevo | En espera: el MVP no envía correos (D-32) |
| Hosting | Vultr + CloudPanel | Cron real desde el día 1 |
| Errores | Sentry | |

Del CRM se copia: login (enlace mágico + scrypt), sesiones, `lib/env.ts`, worker de jobs, envío
Brevo, estructura de monorepo `packages/shared|api|web`, multi-cuenta por subdominio.

## 3. Modelo de datos (resumen)

Archivo completo: `../prisma/schema.prisma`. Explicación en [03-ARQUITECTURA.md](03-ARQUITECTURA.md). Aislamiento y búsqueda: migraciones `rls_busqueda` y `busqueda_por_trigger` en `prisma/migrations/`.

```
Account ──< Membership >── User (global)
   │
   ├──< Project ──< ProjectMember >── User
   │       │
   │       └──< Recording (todolist · todo · message · folder · upload · comment)
   │               ├── parent / children   (tarea → lista, comentario → lo que comenta)
   │               ├── TodoDetail, TodoAssignee
   │               ├── UploadVersion ── Blob (R2)
   │               ├── Mention, Subscription
   │               └──< Event ──< Notification
   └── Job, AuditLog
```

- **Recording** es la pieza clave: comentarios, menciones, papelera, actividad, suscripciones y
  visibilidad se programan una sola vez y sirven para todos los tipos.
- **User es global** y entra a cada cuenta por Membership: un cliente puede estar en dos agencias.
- **Event** se escribe en la misma transacción que el cambio; las Notification salen de ahí en un job.

## 4. Permisos

| Acción | Owner | Admin | Equipo | Cliente |
|---|---|---|---|---|
| Ver todos los proyectos | ✓ | ✓ | solo donde es miembro | solo donde es miembro |
| Crear proyecto | ✓ | ✓ | ✓ | — |
| Invitar equipo | ✓ | ✓ | — | — |
| Invitar cliente a un proyecto | ✓ | ✓ | ✓ | — |
| Ver contenido interno | ✓ | ✓ | ✓ | — |
| Crear tareas, mensajes, archivos | ✓ | ✓ | ✓ | ✓ (nacen visibles) |
| Comentar | ✓ | ✓ | ✓ | en lo visible |
| Cambiar visibilidad para clientes | ✓ | ✓ | ✓ | — |
| Editar o borrar lo ajeno | ✓ | ✓ | — | — |
| Cerrar cuenta, exportar | ✓ | — | — | — |

Todo se decide en `services/permisos.ts` (`puede(ctx, accion, recording)`), nunca suelto en las rutas.
RLS cubre la frontera entre cuentas; `puede()` cubre lo de adentro (proyecto, rol, visibilidad).

## 5. Contexto por petición (cómo se aplica RLS con Prisma)

```ts
// lib/db.ts — cada petición corre en una transacción con la cuenta fijada
export function conCuenta<T>(ctx: { accountId: string; userId: string }, fn: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.account_id', ${ctx.accountId}, true),
                                set_config('app.user_id', ${ctx.userId}, true)`;
    return fn(tx);
  });
}
```

Fastify: hook `onRequest` resuelve subdominio → cuenta, sesión → usuario, verifica Membership activa,
y las rutas usan `conCuenta(req.ctx, ...)`. El worker hace lo mismo por cada job con `accountId`.

**Prueba obligatoria** (día 2): test que crea dos cuentas, consulta desde A sin filtro y comprueba
que no ve nada de B. Corre en CI siempre.

## 6. Plan día por día (15 días hábiles)

### Semana 1 — base

| Día | Qué | Termina con |
|---|---|---|
| 1 ✅ | Monorepo (copiar estructura del CRM), Postgres local, schema, migración inicial + RLS, roles `pm_app`/`pm_admin` | `prisma migrate dev` corre limpio |
| 2 ✅ | `conCuenta()`, hook de contexto, resolución por subdominio, **test de aislamiento** entre cuentas | Test A/B en verde |
| 3 ✅ | Login: enlace mágico + contraseña + sesiones (copiar del CRM), selector de cuenta si tiene varias | Entrar y salir |
| 4 ✅ | Invitaciones por enlace (equipo y cliente-a-proyecto), gestión de personas, `planPermite()` (el `can()` del plan) y límites, soporte en beta, sistema visual del CRM | Invitar a alguien y que entre |
| 5 | Proyectos (crear, miembros, archivar) + servicio Recording genérico: crear, editar, papelera, restaurar, Event en la misma transacción, `puede()` | Pantalla de proyecto vacía con sus secciones |

### Semana 2 — contenido

| Día | Qué | Termina con |
|---|---|---|
| 6 | Editor Tiptap compartido: JSON → HTML sanitizado + texto plano en el servidor; extracción de menciones | Componente `<Editor>` reutilizable |
| 7 | Tareas: listas, crear, ordenar (position), asignar, fecha, completar/reabrir | Lista de tareas usable |
| 8 | Comentarios genéricos (cualquier recording) + menciones + suscripciones automáticas | Comentar en una tarea y mencionar |
| 9 | Mensajes (listado + detalle + comentarios) y feed de actividad del proyecto | Proyecto con tareas, mensajes y actividad |
| 10 | Archivos: URL firmada R2, Uppy, confirmación, carpetas, versiones, job de miniaturas, límite de almacenamiento | Subir un PDF y verlo sin descargar |

### Semana 3 — avisos, cliente y salida

| Día | Qué | Termina con |
|---|---|---|
| 11 | Job `notify.fanout`: Event → Notification (mencionado, asignado, suscrito). Bandeja con no leídos | Bandeja funcionando |
| 12 | Recordatorios dentro de la app (D-38): job diario por zona horaria con tareas que vencen mañana y vencidas, y el resumen de lo que sigues, todo en la bandeja; preferencias de aviso | Recordatorios llegando a la bandeja |
| 13 | Vista del cliente: interruptor "visible para el cliente", herencia de visibilidad, feed filtrado, prueba entrando como cliente | Cliente ve solo lo suyo |
| 14 | Papelera con purga a 30 días, búsqueda simple (tsvector), responsive móvil, exportar cuenta (ZIP) | Todo usable en celular |
| 15 | Servidor Vultr + CloudPanel, Postgres, cron del worker, R2, Sentry, respaldo diario, carga de Lucuma (Brevo cuando haya correo) | En producción con el equipo dentro |

## 7. Riesgos

- **Visibilidad para clientes:** es el error más grave posible. Además del servicio, test por cada
  tipo de recording: cliente no ve lo interno ni por API directa, ni en feed, búsqueda o correos.
- **Correo que satura:** si cada comentario manda correo, lo apagan. Por defecto: inmediato solo
  menciones y asignaciones; el resto va al resumen.
- **Rendimiento de RLS:** transacción por petición tiene un costo pequeño. Índices con `accountId`
  primero; revisar con `EXPLAIN` las consultas del feed y la bandeja.
- **Alcance:** cualquier idea nueva va a la lista de fase 2, no a estas 3 semanas.

## 8. Fase 2 (después de usarlo 1 o 2 meses)

Aprobaciones de piezas, plantillas de proyecto, calendario, chat simple, WhatsApp (iniciar el
trámite con Meta antes), conexión con el CRM (lead ganado → proyecto). Luego, para vender:
cobros (Paddle o Lemon Squeezy afuera; Culqi o Mercado Pago en Perú), onboarding con prueba,
superadmin, términos y privacidad.
