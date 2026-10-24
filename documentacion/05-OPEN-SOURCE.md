# 05. Open source

Evaluación del 2026-10-24. Las licencias cambian: revisar la del repo antes de usar algo.

## Licencias y qué permiten para un SaaS

| Licencia | ¿Se puede vender como SaaS? |
|---|---|
| MIT, Apache 2.0, BSD | Sí, sin obligaciones relevantes |
| MPL 2.0, EPL 2.0 | Sí; los cambios a los archivos de la librería se publican |
| AGPL 3.0 | Sí, pero hay que publicar el código de tus cambios si lo ofreces online: un competidor podría copiar tu versión |
| GPL 3.0 | Sí como servicio, pero mezcla mal con código propio distribuido |
| O'Saasy (37signals) | No: prohíbe ofrecerlo como SaaS que compita |

## Apps completas evaluadas

| Proyecto | Qué es | Stack | Licencia | Veredicto |
|---|---|---|---|---|
| Plane | Tipo Linear o Jira, el más pulido | Django + Next.js | AGPL | Referencia de diseño; no fork |
| Huly | Todo en uno (tareas, chat, docs) | Svelte + TS, infraestructura pesada | EPL 2.0 | Licencia sirve, pero muy complejo de mantener |
| Leantime | El más cercano a Basecamp en filosofía | PHP | AGPL | AGPL y otro stack |
| OpenProject | Gestión de proyectos empresarial | Rails | GPL 3 | Pesado, otro público |
| Kanboard | Kanban simple | PHP | MIT | Muy básico, poco desarrollo activo |
| Campfire (37signals) | Chat | Rails | MIT | Referencia si llega el chat |
| Fizzy (37signals) | Kanban | Rails | O'Saasy | No se puede vender |

**Decisión** (D-07): no hacer fork. Se construye el núcleo propio y se miran Plane y Campfire
como referencia de cómo resolvieron cada cosa, sin copiar código AGPL.

## Librerías elegidas

| Necesidad | Librería | Licencia | Cuándo entra |
|---|---|---|---|
| Editor con menciones y checklists | Tiptap (alternativa: BlockNote) | MIT (Tiptap tiene extras de pago) | Día 6 |
| Subida de archivos | Uppy + subida directa a R2 | MIT | Día 10 |
| Miniaturas de imágenes | sharp | Apache 2.0 | Día 10 |
| Componentes de interfaz | shadcn/ui | MIT | Día 3 en adelante |
| Arrastrar y ordenar | dnd-kit | MIT | Día 7 |
| Visor de PDF | PDF.js | Apache 2.0 | Día 10 |
| Validación | zod | MIT | Día 1 (instalado) |
| Postgres local | embedded-postgres | MIT | Día 1 (instalado) |

## Para fases siguientes

| Necesidad | Librería | Licencia |
|---|---|---|
| Edición colaborativa en docs | Yjs + Hocuspocus | MIT |
| Notificaciones multicanal (bandeja, correo, WhatsApp) | Novu | MIT (núcleo) |
| Anotar sobre imágenes o PDF (aprobaciones) | Annotorious | BSD |
| Búsqueda avanzada | Meilisearch | MIT |
| Login externo (si se deja el del CRM) | Better Auth | MIT |

Descartado en el MVP: BullMQ + Redis (ver D-14).
