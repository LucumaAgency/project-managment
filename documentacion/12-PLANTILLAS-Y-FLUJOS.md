# 12 · Plantillas y flujos

Estado: **etapas 1 a 4 construidas el 2026-10-25** (plantillas de lista; tareas que piden algo y ficha del cliente; accesos protegidos; «se activa cuando»; ver «Cómo funciona hoy» al final). Etapa 5 (cargar las plantillas reales), pendiente. Diseño confirmado por el usuario (D-64). Se abrió el 2026-10-24 a pedido del usuario: "algo que me
gusta bastante de Basecamp es armar flujos, por ejemplo un onboarding de un cliente, y que haya
una plantilla de cosas". Falta que el usuario responda las preguntas del final antes de decidir
el alcance (luego va a 04-DECISIONES y al plan).

En 02-FUNCIONALIDAD las plantillas estaban en la fase 2 ("se definen mejor después de usar la
herramienta"). Este documento adelanta su diseño.

## Qué resuelve

Procesos que se repiten igual con cada cliente (onboarding, lanzamiento de web, mes de
contenido) hoy se arman a mano cada vez y dependen de la memoria de quien los arma. Una
plantilla los deja escritos una vez, con fechas, responsables y lo que le toca al cliente.

## Propuesta por niveles

### Nivel 1 · Plantillas de proyecto (lo que hace Basecamp)

Un proyecto modelo ("Onboarding de cliente") con listas, tareas, mensajes y carpetas. Al crear
un proyecto, "Desde plantilla" pide:

- **Fecha de inicio.** En la plantilla las fechas son relativas ("día 1", "día 3", "semana 2")
  y se convierten en fechas reales al crear. Ejemplo: inicio lunes 27, "día 3" → miércoles 29.
- **Quién cubre cada rol.** Las tareas de la plantilla no van a una persona sino a un rol
  ("Cuenta", "Diseño", "Desarrollo"). Al crear se elige la persona de cada rol.
- **El cliente**, si ya se invita.

Las tareas marcadas visibles para el cliente le aparecen a él ("Envíanos tu logo en alta",
"Completa el brief"): sabe qué le toca sin perseguirlo por WhatsApp. Ya existe la visibilidad
por elemento (vista del cliente, día 13), así que solo se copia.

### Nivel 2 · Plantilla de lista en un proyecto que ya existe

Lo mismo, más chico: en un proyecto armado, "agregar la lista *Lanzamiento de web*" con sus
tareas, fechas relativas y roles. Para procesos que se repiten dentro de un cliente (campaña,
blog, cierre de mes).

### Nivel 3 · Flujos con orden (va más allá de Basecamp)

- **Pasos en orden:** una tarea se activa al completarse la anterior ("Diseñar propuesta" se
  asigna recién cuando se completa "Recibir el brief"). El aviso llega a la bandeja en ese
  momento, no antes.
- **Fechas que se corren:** si un paso se atrasa, los siguientes se mueven solos.
- Más adelante: tablero por etapas (Por hacer → En curso → Revisión del cliente → Hecho), como
  el Card Table de Basecamp.

### Cómo se crean

- "Guardar como plantilla" desde un proyecto que salió bien: las fechas pasan a relativas
  (respecto a la fecha de inicio del proyecto) y las personas a roles.
- Sección "Plantillas" donde se editan como cualquier proyecto.
- Desde el bot de Telegram (API de bots, 11-API-BOT): "crea el proyecto Flecha Taxi con la
  plantilla Onboarding, empieza el lunes".

## Recomendación

Empezar por niveles 1 y 2 (fechas relativas, roles, tareas visibles para el cliente), probarlo
con el onboarding real de Lucuma y sumar el nivel 3 después. El nivel 1 es el que más tiempo
ahorra; el orden y las fechas que se corren se aprecian una vez que ya se usan plantillas.

## Encaje técnico (borrador, a confirmar al decidir)

- Una plantilla puede ser un proyecto con una marca (`isTemplate`), oculto de Proyectos,
  Tareas, búsqueda, bandeja y recordatorios. Así se edita con las mismas pantallas.
- Cada tarea de plantilla guarda `diaRelativo` (desde el inicio) y `rol` en lugar de fecha y
  responsables. Los roles son por cuenta (lista editable).
- "Crear desde plantilla" copia el árbol de elementos (listas, tareas, mensajes, carpetas;
  archivos por referencia al mismo blob) en una transacción, con la visibilidad de cada uno, y
  genera los eventos y avisos como si se hubieran creado a mano.
- Nivel 3: `dependeDe` entre tareas; al completar una, se activan (se asignan y se fechan) las
  que dependían de ella.
- API de bots: `POST /api/v1/bot/proyectos` con `plantilla`, `inicio` y `roles`.

## Respuestas del usuario (2026-10-25)

1. **Onboarding:** primero, los datos del cliente (nombre, redes sociales, RUC), la foto del
   depósito, el contrato y la propuesta. Después, lo de cada servicio. Por ejemplo, para
   desarrollo web: manual de marca (o colores y fuentes), referencias web, accesos al proveedor
   de dominio, al hosting y a la web actual si tiene.
2. **Roles (Cuenta, Diseño, Desarrollo…): no** por ahora, no le hace sentido.
3. **El cliente participa:** sí, completa sus propias tareas.
4. **Flujos:** uno de onboarding de cliente y uno por servicio.

## Propuesta ajustada (2026-10-25, a confirmar)

- **Un proyecto por cliente**, como ya se usa (Vaporis, Proba). El onboarding y cada servicio
  son **plantillas de lista** que se agregan al proyecto (el nivel 2 pasa a ser el principal).
  Un cliente que contrata web y redes recibe tres listas: Onboarding, Desarrollo web y Redes.
- **Sin roles.** Cada tarea de la plantilla dice solo si la hace el **cliente** o el **equipo**.
  Las del cliente se le asignan a él y las ve. Las del equipo van a quien agrega la plantilla,
  y se pueden reasignar.
- **Tareas que piden algo** (lo nuevo frente a Basecamp): además de la tarea normal, una tarea
  puede pedir
  - **datos** (un pequeño formulario: RUC, razón social, redes…);
  - **archivos** (foto del depósito, manual de marca, logo);
  - **enlaces** (referencias web, con un comentario de qué le gusta).

  El cliente la completa respondiendo o subiendo ahí mismo, y la tarea se marca sola. Lo que
  responde queda en una **ficha del cliente** dentro del proyecto (datos de la empresa, marca,
  accesos), para no buscarlo después entre comentarios.
- **Fechas relativas** a cuando se agrega la plantilla ("día 2"). Opcionales.
- **Accesos (dominio, hosting, web):** no conviene pedir contraseñas en texto normal: quedan en
  comentarios, búsqueda, exportación y avisos. Opciones:
  - pedir que el cliente invite al correo de Lucuma en el proveedor, sin compartir claves;
  - o un campo protegido: solo lo ve el equipo, se muestra con un clic, no entra en búsqueda,
    avisos ni actividad, y queda registrado quién lo vio.

### Borrador: Onboarding de cliente

| Quién | Tarea | Pide |
|---|---|---|
| Cliente | Datos de la empresa | Razón social, nombre comercial, RUC, contacto (nombre, cargo, WhatsApp, correo) |
| Cliente | Redes sociales y web actual | Enlaces de cada red y de la web |
| Cliente | Constancia del depósito (50 %) | Archivo (foto o PDF) |
| Equipo | Verificar el depósito | Se activa cuando el cliente sube la constancia |
| Equipo | Contrato firmado | Archivo |
| Equipo | Propuesta aprobada | Archivo |
| Equipo | Mensaje de bienvenida (visible al cliente) | Qué sigue y en qué plazos |

### Borrador: Servicio de desarrollo web

| Quién | Tarea | Pide |
|---|---|---|
| Cliente | Manual de marca | Archivo; si no hay: colores, tipografías y logo en alta |
| Cliente | Referencias web | Enlaces + qué le gusta de cada una |
| Cliente | Acceso al dominio | Proveedor + acceso (ver accesos) |
| Cliente | Acceso al hosting | Proveedor + acceso |
| Cliente | Acceso a la web actual (si tiene) | URL de administración + acceso |
| Cliente | Contenidos | Textos y fotos, o "los hace Lucuma" |
| Equipo | Revisar materiales y pedir lo que falte | — |

## Preguntas abiertas al usuario (primera ronda, ya respondidas arriba)

1. **Pasos del onboarding de Lucuma hoy.** Por ejemplo: contrato y 50 % → accesos (web, redes,
   GMB) → brief → kickoff → … (O se arma un borrador con lo que se sabe de las políticas y
   propuestas de Lucuma y el usuario lo corrige.)
2. **Roles del equipo:** ¿Cuenta, Diseño, Desarrollo, Contenido, Ads?
3. **El cliente:** ¿ve y completa sus tareas del onboarding (subir logo, dar accesos), o el
   onboarding es solo interno por ahora?
4. **Otros flujos** que se usarían después (lanzamiento de web, campaña de Ads, mes de contenido
   para redes), para que el diseño cubra todos y no solo el onboarding.

## Confirmado (2026-10-25)

- Los dos borradores (Onboarding y Desarrollo web) sirven tal cual.
- Accesos: **opción B**, campo protegido (solo el equipo, se ve con un clic, fuera de búsqueda,
  avisos, actividad y exportación, con registro de quién lo vio). Se guarda cifrado con una
  clave del servidor (`ACCESOS_CLAVE` en el `.env`), así el respaldo y la base no lo tienen en
  claro.
- Contrato: lo puede subir **cualquiera de los dos**. La tarea es del equipo, pero el cliente la
  ve y también puede subir el archivo.
- Primera plantilla de servicio: **Desarrollo web**.

## Plan de construcción (confirmado el 2026-10-25)

| Etapa | Qué | Días aprox. |
|---|---|---|
| 1 ✅ | Plantillas de lista: sección Plantillas, tareas "cliente / equipo / cualquiera", fechas relativas opcionales; "Agregar plantilla" en un proyecto; también por el bot | 2 |
| 2 ✅ | Tareas que piden algo (datos, archivos, enlaces), se marcan solas al responder; ficha del cliente en el proyecto | 2 |
| 3 ✅ | Campo protegido para accesos (cifrado, ver con un clic, registro de quién lo vio) | 1 |
| 4 ✅ | "Se activa cuando…" (ej. verificar el depósito tras la constancia) | 0,5 |
| 5 | Cargar Onboarding y Desarrollo web como primeras plantillas; probar con un cliente real | 0,5 |

Cada etapa sale a producción por separado y se puede usar sin esperar a las siguientes.

## Cómo funciona hoy (etapa 1, 2026-10-25)

**En la web**
- Menú **Plantillas** (todo el equipo; el cliente no la ve). Dueño y admin crean, editan y
  borran; el resto del equipo las ve y las usa.
- Cada tarea de la plantilla tiene título, notas (opcional), **para quién** (Equipo / Cliente /
  Cualquiera) y **día** (opcional; 1 = la fecha de inicio).
- En las **Tareas** de un proyecto, **Desde plantilla**: se elige la plantilla, la fecha de
  inicio, el nombre de la lista, quién del equipo lleva las tareas del equipo (por defecto,
  quien la agrega) y qué clientes del proyecto reciben las suyas (por defecto, todos). Muestra
  antes las tareas que se van a crear, con su fecha real.
- En el menú de una lista, **Guardar como plantilla** (dueño y admin): las fechas pasan a
  "día N" contando desde el día en que se creó la lista, y las personas no se guardan, solo
  para quién era cada tarea.

**Qué crea al agregarla**
- Una lista nueva (visible para el cliente si alguna tarea es suya) con sus tareas en orden.
- Equipo → interna, asignada al responsable elegido.
- Cliente → visible, asignada a los clientes elegidos (puede completarla él).
- Cualquiera → visible, asignada al responsable y a los clientes.
- Todo como si se hubiera hecho a mano: actividad a nombre de quien la agregó, avisos de
  asignación (el cliente recibe uno por cada tarea suya) y seguimiento.
- Si el proyecto no tiene clientes, sus tareas quedan visibles y sin asignar, y se avisa.

**Por el bot**: `GET /api/v1/bot/plantillas` y `POST /api/v1/bot/plantillas/aplicar`
(11-API-BOT.md). Desde Telegram: "arranca el onboarding de Flecha Taxi el lunes".

**Técnico**: tablas `list_templates` y `list_template_items` con RLS por cuenta (migración
`20261026090000_plantillas`); `services/plantillas.ts`, `routes/plantillas.ts`,
`paginas/Plantillas.tsx`, `paginas/Plantilla.tsx`, modal en `paginas/Tareas.tsx`. Las
plantillas van en la exportación de la cuenta (`cuenta.json`).

## Cómo funciona hoy (etapa 2, 2026-10-25, D-65)

**Pedir algo**
- En cualquier tarea (el equipo): «+ Pedir datos, archivos o enlaces». Cada campo tiene un
  nombre, un tipo (Texto corto, Párrafo, Archivos, Enlaces) y si es obligatorio.
- En una plantilla: «+ pedir datos» en cada tarea; al agregarla, la tarea nace pidiendo eso.
  «Guardar como plantilla» también copia lo que pide cada tarea.
- Cambiar lo que pide conserva las respuestas de los campos que quedan. Las de los campos que
  se quitan, o que cambian de tipo, se borran (la web avisa antes).

**Responder**
- Responde quien puede completar la tarea: el equipo o el cliente si la tiene asignada.
- En la tarea aparece «Lo que se pide» con cada campo. Texto y enlaces se guardan con «Guardar
  respuestas»; los archivos se suben al elegirlos (varios a la vez) y se pueden quitar.
- Cuando están todos los obligatorios, la tarea se **completa sola** (a nombre de quien
  respondió). Si después se borra una respuesta, no se reabre sola.
- Cada respuesta queda en la actividad («respondió…») y avisa a quienes siguen la tarea.
- En la lista, la tarea muestra «Pide 2/3».

**Ficha del cliente**
- En el proyecto aparece la sección **Ficha del cliente** cuando alguna tarea pide algo: junta
  todo lo respondido, tarea por tarea, con un avance («4 de 10 respondidos»). Cada quien ve
  solo lo de las tareas que puede ver (el cliente, las visibles).
- Va en la exportación: `ficha.html` en cada proyecto y los archivos en `ficha/<tarea>/`.

**Archivos de las respuestas**: cuelgan de la tarea (no aparecen en Archivos) y se abren con
los mismos permisos que ella. Si se quitan, la purga los borra del disco al día siguiente.

**Por ahora no**: las respuestas no entran en la búsqueda; el bot no responde campos.

**Técnico**: `TodoDetail.fields` y `ListTemplateItem.fields` (JSON con los campos) y la tabla
`task_answers` con RLS (migración `20261026120000_campos_y_respuestas`); `services/campos.ts`;
`PUT /tareas/:id/respuestas`, `POST /tareas/:id/campos/:campo/archivos`,
`GET /proyectos/:id/ficha`; `componentes/Campos.tsx`, `paginas/Ficha.tsx`.

## Cómo funciona hoy (etapa 3, 2026-10-25, D-66)

**Pedir un acceso**: en lo que pide una tarea, el tipo **Acceso (protegido)**. Quien responde
llena proveedor, dónde se entra, usuario, contraseña y notas.

**Quién ve qué**
- El proveedor (ej. «Hostinger») queda a la vista de quien ve la tarea.
- Lo demás se guarda **cifrado** y no sale nunca en el detalle, la lista, la ficha, la
  actividad, los avisos, la búsqueda ni la exportación (ahí dice «Acceso protegido: no se
  exporta»).
- **Solo el equipo** lo abre, con **Ver acceso** (con botón Copiar; se oculta solo al minuto).
  Cada vez queda en el registro de seguridad, y la tarea muestra «Lo vieron: …».
- El cliente que lo cargó no lo vuelve a ver: ve «Acceso guardado · Hostinger» y puede
  reemplazarlo con **Cambiar este acceso**. Un acceso vacío no borra el anterior.

**La clave del servidor**: `ACCESOS_CLAVE` en el `.env` (64 caracteres hex). Sin ella, los
accesos no se pueden guardar (la app lo dice). Si se pierde o se cambia, los accesos guardados
ya no se pueden leer: hay que guardar una copia fuera del servidor. `base:verificar:prod` dice
si está y, si falta, sugiere una.

**Técnico**: `lib/cifrado.ts` (AES-256-GCM, `v1.<iv>.<tag>.<cifrado>`); en `task_answers` el
valor es `{ proveedor, cifrado }`; `valorPublico()` lo reduce a `{ proveedor, protegido }` en
toda salida; `POST /tareas/:id/campos/:campo/ver` (equipo, `audit_log` con `acceso.ver`). Sin
migración: es un tipo de campo más.

## Cómo funciona hoy (etapa 4, 2026-10-25, D-67)

**Esperar a otra tarea**
- En una tarea (el equipo): «Se activa cuando se complete» → otra tarea del proyecto, y
  opcionalmente «Vence a los N días desde que se activa».
- En una plantilla: «Se activa cuando se complete» → una tarea anterior de la plantilla. Ahí
  «Día» pasa a contar desde que se activa.

**Mientras espera**: no tiene responsables ni fecha, así nadie recibe avisos ni recordatorios
de algo que todavía no puede hacer. En la lista dice «Espera: …»; en la tarea, a quién se
asignará (los responsables que se marquen mientras espera son esos). Al cliente nunca se le
muestra el nombre de una tarea interna: ve «Espera: una tarea del equipo».

**Al completarse la anterior** (la complete quien la complete, también el cliente): se
activa sola, se asigna a los previstos, les llega el aviso y vence N días después contando ese
día. En la actividad: «… completó el paso anterior y se activó …». Funciona en cadena: cada
paso activa el siguiente. Si un paso se atrasa, las fechas de los siguientes se corren solas.

**Casos borde**: si la tarea que se esperaba se borra, la tarea lo dice y el equipo la activa
con «Activar ahora». Completar a mano una tarea que espera la saca de la espera. No se permiten
esperas en vuelta (A espera a B y B a A).

**Técnico**: `TodoDetail.waitsForId`, `pendingAssigneeIds`, `dueAfterDays` y
`ListTemplateItem.waitsFor` (migración `20261026150000_se_activa_cuando`); `services/espera.ts`;
`completarTarea` llama a `activarLasQueEsperan`; `POST /tareas/:id/activar`; `PATCH /tareas/:id`
con `esperaA` y `diasDespues`. Evento nuevo: `activated`.
