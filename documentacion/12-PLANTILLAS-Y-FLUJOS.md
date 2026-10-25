# 12 · Plantillas y flujos (diseño en conversación)

Estado: **propuesta, sin construir.** Se abrió el 2026-10-24 a pedido del usuario: "algo que me
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

## Preguntas abiertas al usuario

1. **Pasos del onboarding de Lucuma hoy.** Por ejemplo: contrato y 50 % → accesos (web, redes,
   GMB) → brief → kickoff → … (O se arma un borrador con lo que se sabe de las políticas y
   propuestas de Lucuma y el usuario lo corrige.)
2. **Roles del equipo:** ¿Cuenta, Diseño, Desarrollo, Contenido, Ads?
3. **El cliente:** ¿ve y completa sus tareas del onboarding (subir logo, dar accesos), o el
   onboarding es solo interno por ahora?
4. **Otros flujos** que se usarían después (lanzamiento de web, campaña de Ads, mes de contenido
   para redes), para que el diseño cubra todos y no solo el onboarding.
