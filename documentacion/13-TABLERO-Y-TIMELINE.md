# 13 · Tablero (tipo Trello) y timeline

Estado: tablero y timeline construidos el 2026-10-25.

Pedido por el usuario el 2026-10-25: un card table como el de Basecamp, para coordinar el
contenido y los shoots de los clientes (días de grabación), y de la mano una vista de timeline.

## La idea: una sola cosa con dos vistas (D-68)

En Basecamp, las listas de tareas y el card table son dos herramientas que repiten casi todo
(una tarjeta es casi una tarea). Aquí no: **una lista de tareas se puede ver como tablero**. Las
tarjetas son las mismas tareas, así que heredan todo lo que ya existe: lo que pide la tarea, la
ficha del cliente, los accesos, «se activa cuando», las plantillas, los recordatorios, el bot de
Telegram y la vista del cliente.

- **Lista**: responde «¿qué falta?»; cada tarea está hecha o no.
- **Tablero**: responde «¿en qué etapa está cada cosa?»; las tarjetas pasan de columna en columna.

## Cómo funciona (construido el 2026-10-25)

**Ver como tablero**: en el menú (⋯) de una lista, «Ver como tablero» / «Ver como lista». Las
columnas se guardan aunque se vuelva a lista.

**Columnas**: por defecto **Sin empezar → En proceso → En revisión → Hecho** (decidido por el
usuario: general, sin empezar por un proceso). Se editan por tablero («Editar columnas»): nombre,
orden, agregar, quitar (sus tarjetas pasan a la primera) y cuál es la de **revisión del
cliente**. La última es siempre la de terminado: llegar ahí completa la tarea y salir la reabre;
completar con la casilla en la vista de lista también la manda ahí.

**Mover**: el equipo arrastra las tarjetas (en celular, desde la tarjeta: «Columna»). En la
actividad: «movió «Post 3» a «En revisión»». Pasar a revisión avisa a quienes siguen la
tarjeta.

**Revisión del cliente**: el cliente ve el tablero (lo visible para él). En la columna de
revisión, cada tarjeta le muestra **Aprobar** (pasa a Hecho, «aprobó…») y **Pedir cambios**
(escribe qué cambiar; vuelve a la columna anterior y queda como comentario).

**Pasos** (como los de Basecamp): una mini lista dentro de cada tarea o tarjeta («Guion
aprobado ✓, Locación, Vestuario»). El equipo los agrega y quita; quien tiene la tarea los marca
(queda quién). La tarjeta muestra «1/3».

**Técnico**: tabla `list_boards` (columnas en JSON con ids estables, RLS) y `TodoDetail.columnId`
y `steps` (migración `20261026180000_tablero`); `services/tablero.ts`; rutas
`POST /listas/:id/tablero`, `PUT /listas/:id/columnas`, `POST /tareas/:id/columna`,
`POST /tareas/:id/aprobar`, `POST /tareas/:id/pedir-cambios`, `PUT /tareas/:id/pasos`; web
`componentes/Tablero.tsx`. Eventos nuevos: `column_changed`, `approved`, `changes_requested`.

**Todavía no**: columnas en las plantillas (que una plantilla traiga su tablero), pasos en las
plantillas, reordenar dentro de una columna arrastrando (la tarjeta movida va al final).

## Timeline (construido el 2026-10-25)

Para coordinar shoots y entregas. Menú **Timeline** (todos, también el cliente) y botón
**Timeline** en las Tareas de un proyecto.

- **De toda la agencia o de un proyecto** (selector arriba). Cada quien ve lo mismo que en
  Tareas: dueño y admin, todos los proyectos activos; el equipo, los suyos; el cliente, los suyos
  y solo lo visible.
- **Línea**: una fila por tarea, agrupadas por proyecto, con los días arriba (hoy marcado, fines
  de semana sombreados). Con fecha de inicio y de entrega es una **barra**; con una sola fecha,
  un **punto**. Colores: pendiente (azul), en revisión del tablero (ámbar), vencida (rojo),
  hecha (verde). Tocar abre la tarea.
- **Agenda** (por defecto en el celular): día por día, con proyecto, columna y responsables.
- Navegar por semanas (← Hoy →) y ver 1, 2, 4 u 8 semanas.
- **Fecha de inicio** nueva en las tareas («+ fecha de inicio», solo el equipo; va antes que la
  entrega). Usa `TodoDetail.startsOn`, que ya existía en la base.

**Técnico**: `services/timeline.ts`, `GET /timeline?desde=&hasta=&proyecto=` (hasta 120 días y
600 tareas); `paginas/Timeline.tsx`. Sin migración.

**Hora y lugar** (2026-10-25, D-69): las tareas tienen hora (y hora de fin, opcional) y lugar
(texto o enlace, con «Abrir en el mapa»). Se ven en la lista, la tarjeta, el detalle y el
timeline (la agenda ordena cada día por hora). El bot de Telegram también los recibe y
devuelve (`proyectos.py crear --hora 09:00 --hasta 13:00 --lugar "…"`). La hora es la de la
cuenta (America/Lima), sin convertir. Todavía no hay recordatorio «una hora antes» (los
recordatorios de la app son por día).

**Todavía no**: arrastrar barras para cambiar fechas, filtrar por persona.
