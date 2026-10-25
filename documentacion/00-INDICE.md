# Lucuma Proyectos: documentación

Todo lo que se decidió, se planeó y se construyó, en un solo lugar. Si algo cambia, se
actualiza aquí y se anota en la bitácora de [09-AVANCE.md](09-AVANCE.md).

## Estado al 2026-10-24

- **Fase:** MVP de 15 días terminado y en uso (beta). API para el bot de Telegram en producción.
- **Repo:** https://github.com/LucumaAgency/project-managment (público, rama `main`).
- **En línea:** https://proyectos.pruebalucuma.site (beta en Plesk, guía en [10-DESPLIEGUE-PLESK.md](10-DESPLIEGUE-PLESK.md)).
- **Siguiente paso:** desplegar hora y lugar; después, la fase 3 cuando se decida ([14-FASE-3-VENDER.md](14-FASE-3-VENDER.md)).
- **Esperando tu confirmación:** ver «Para confirmar» en [09-AVANCE.md](09-AVANCE.md).

## Documentos

| # | Documento | Qué responde |
|---|---|---|
| 01 | [Visión y negocio](01-VISION-Y-NEGOCIO.md) | Qué es, para quién, cómo se diferencia, cómo pasa de uso interno a producto |
| 02 | [Funcionalidad](02-FUNCIONALIDAD.md) | Qué hace cada módulo del MVP, reglas de comportamiento, qué queda fuera |
| 03 | [Arquitectura](03-ARQUITECTURA.md) | Stack, modelo de datos, permisos, visibilidad, avisos, archivos, búsqueda |
| 04 | [Decisiones](04-DECISIONES.md) | Registro de decisiones con fecha, motivo y alternativas descartadas |
| 05 | [Open source](05-OPEN-SOURCE.md) | Apps evaluadas para construir encima, licencias, librerías elegidas |
| 06 | [WhatsApp (futuro)](06-WHATSAPP-FUTURO.md) | Diseño de la integración para la fase 2 y trámites con Meta |
| 07 | [Plan del MVP](07-PLAN-MVP.md) | Alcance, stack, permisos y cronograma día por día con estado |
| 08 | [Desarrollo](08-DESARROLLO.md) | Cómo correrlo en local, roles de la base, migraciones, servidor |
| 10 | [Despliegue en Plesk](10-DESPLIEGUE-PLESK.md) | Requisitos, base, Git de Plesk, variables, primer arranque, verificación |
| 11 | [API para bots](11-API-BOT.md) | Bot de Telegram: claves, rutas y ejemplos |
| 14 | [Fase 3: vender](14-FASE-3-VENDER.md) | Paso a paso para venderlo a otras agencias |
| 15 | [Servidor en Vultr](15-SERVIDOR-VULTR.md) | Servidor propio: qué contratar, instalación con script, despliegue, mudanza desde Plesk |
| 16 | [Espacio para archivos](16-ESPACIO-DE-ARCHIVOS.md) | Cómo limitan Basecamp, Slack y otros; topes por plan; cuándo pasar a R2 |
| 13 | [Tablero y timeline](13-TABLERO-Y-TIMELINE.md) | Listas vistas como tablero tipo Trello, revisión del cliente, pasos; timeline |
| 12 | [Plantillas y flujos](12-PLANTILLAS-Y-FLUJOS.md) | Plantillas de lista (onboarding, servicios): diseño, plan por etapas y cómo funciona |
| 09 | [Avance](09-AVANCE.md) | Bitácora con fechas, qué se probó, problemas encontrados, **pendientes** |

## Cómo leerla

- Para entender el producto: 01 → 02.
- Para programar: 03 → 07 → 08.
- Para saber por qué algo es como es: 04.
- Para saber qué falta: 09 (es la **única** lista de pendientes; los demás documentos no llevan casillas).
