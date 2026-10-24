# Lucuma Proyectos

Gestión de proyectos tipo Basecamp para agencias, con portal de clientes. Primero para uso de
Lucuma, diseñado desde el inicio para venderse como SaaS multi-cuenta. Nombre de trabajo.

**Toda la documentación está en [documentacion/](documentacion/00-INDICE.md):** visión y
negocio, funcionalidad, arquitectura, decisiones, open source, WhatsApp (futuro), plan del MVP,
desarrollo y avance (bitácora + única lista de pendientes).

- Correr en local: [documentacion/08-DESARROLLO.md](documentacion/08-DESARROLLO.md)
- Modelo de datos: [prisma/schema.prisma](prisma/schema.prisma)

## Estructura

```
packages/shared   roles y planes (compartido API ↔ web)
packages/api      Fastify 5 + Prisma 6 (rol pm_app, sujeto a RLS)
packages/web      React + Vite
prisma/           schema + migraciones (init, rls_busqueda, busqueda_por_trigger)
scripts/          db-local.mjs: Postgres 16 local sin instalar nada
```

## Estado

Día 1 de 15 del MVP terminado (2026-10-24). Detalle en
[documentacion/09-AVANCE.md](documentacion/09-AVANCE.md).
