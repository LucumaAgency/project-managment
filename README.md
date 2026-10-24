# Lucuma Proyectos

Gestión de proyectos tipo Basecamp para agencias, con portal de clientes. Primero para uso de
Lucuma, diseñado desde el inicio para venderse como SaaS multi-cuenta. Nombre de trabajo.

- Plan del MVP, stack, permisos y cronograma de 15 días: [docs/PLAN-MVP.md](docs/PLAN-MVP.md)
- Modelo de datos: [prisma/schema.prisma](prisma/schema.prisma) (validado con Prisma 5.22)
- Aislamiento por cuenta y búsqueda: [prisma/rls.sql](prisma/rls.sql)

Estado (2026-10-24): diseño, sin código de aplicación. `rls.sql` probado sobre el schema en
PGlite (Postgres 16): sin contexto no se ve nada; la cuenta A no lee, busca, inserta ni modifica
filas de la cuenta B; la membresía propia en otra cuenta sí se lista (selector de cuenta).
