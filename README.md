# Lucuma Proyectos

Gestión de proyectos tipo Basecamp para agencias, con portal de clientes. Primero para uso de
Lucuma, diseñado desde el inicio para venderse como SaaS multi-cuenta. Nombre de trabajo.

- Plan del MVP, stack, permisos y cronograma de 15 días: [docs/PLAN-MVP.md](docs/PLAN-MVP.md)
- Correr en local, roles de la base, aislamiento y migraciones: [docs/DESARROLLO.md](docs/DESARROLLO.md)
- Modelo de datos: [prisma/schema.prisma](prisma/schema.prisma)

## Estructura

```
packages/shared   roles y planes (compartido API ↔ web)
packages/api      Fastify 5 + Prisma 6 (rol pm_app, sujeto a RLS)
packages/web      React + Vite
prisma/           schema + migraciones (init, rls_busqueda, busqueda_por_trigger)
scripts/          db-local.mjs: Postgres 16 local sin instalar nada
```

## Bitácora

- **2026-10-24 — Día 1.** Monorepo, Postgres local, migraciones con RLS y búsqueda, dos roles
  (`pm_app` / `pm_admin`). Comprobado: la base no difiere del schema; con Prisma y el rol de la
  app, sin cuenta no se ve nada, cada cuenta ve solo lo suyo, la búsqueda respeta la cuenta, y
  crear en otra cuenta lo rechaza Postgres. Web → API → base responde (`/api/v1/salud`).
- **2026-10-24 — Diseño.** Plan, schema y políticas.
