# 02. Funcionalidad

Qué hace cada parte del MVP, visto desde quien la usa, con las reglas que la gobiernan. El
cómo técnico está en [03-ARQUITECTURA.md](03-ARQUITECTURA.md).

## Conceptos

- **Cuenta:** la agencia. Tiene su subdominio (`lucuma.app.com`), su plan y sus personas.
- **Persona:** alguien con correo. Una misma persona puede estar en varias cuentas (un cliente
  que trabaja con dos agencias, o soporte de Lucuma).
- **Rol en la cuenta:** dueño, administrador, equipo o cliente.
- **Proyecto:** un cliente o un trabajo. Tiene miembros y secciones.
- **Elemento:** cualquier cosa dentro de un proyecto: lista de tareas, tarea, mensaje, carpeta,
  archivo o comentario. Todos comparten comentarios, menciones, papelera, historial y
  visibilidad para el cliente.

## MVP

### 1. Cuentas, personas e invitaciones

- Una cuenta se crea por script en el MVP (el registro abierto llega en la fase 3).
- El dueño o un admin invita al equipo por correo, con su rol.
- Cualquiera del equipo puede invitar a un cliente **a un proyecto concreto**. Al aceptar,
  entra directo a ese proyecto.
- Las invitaciones vencen. Si la persona ya existe (por otra cuenta), se suma sin crear otra
  identidad.
- Acceso por enlace mágico al correo o con contraseña (mismo sistema que el CRM).
- Si una persona está en varias cuentas, al entrar elige a cuál.
- Una persona se puede desactivar en una cuenta sin borrar lo que hizo.

### 2. Proyectos

- Crear, renombrar, describir, archivar y mandar a la papelera.
- Miembros: se agregan y quitan personas de la cuenta.
- Dueño y admin ven todos los proyectos sin ser miembros. Equipo y clientes, solo los suyos.
- Al entrar: secciones Tareas, Mensajes, Archivos y Actividad.

### 3. Tareas

- Listas de tareas dentro del proyecto (por ejemplo "Diseño", "Desarrollo", "Contenido").
- Cada tarea: título, descripción con formato, uno o varios responsables, fecha de entrega,
  comentarios.
- Completar y reabrir. Queda quién y cuándo.
- Reordenar tareas y listas arrastrando.
- Kanban opcional (misma información, otra vista).
- La fecha es un día, sin hora: "para el viernes" no depende de la zona horaria.

### 4. Mensajes

- Anuncios o temas largos del proyecto ("Brief de la campaña", "Cambios de la home").
- Título y cuerpo con formato, imágenes pegadas y menciones.
- Comentarios debajo.
- Es donde quedan las decisiones, a diferencia de un chat, donde se pierden.

### 5. Archivos

- Subir imágenes, PDF y documentos, también arrastrando.
- Carpetas.
- Vista previa sin descargar (miniatura de imágenes y de la primera página de un PDF).
- Subir una versión nueva conserva las anteriores, con nota opcional ("v2 con logo más grande").
- Comentarios sobre cada archivo.
- El almacenamiento usado cuenta contra el plan de la cuenta.

### 6. Comentarios y menciones

- Se comenta en tareas, mensajes y archivos, siempre con el mismo componente.
- `@nombre` menciona a una persona del proyecto y le llega aviso.
- Quien crea, comenta, es asignado o es mencionado queda **siguiendo** el elemento: recibe
  aviso de los comentarios nuevos. Puede dejar de seguirlo.

### 7. Notificaciones

- **Bandeja** en la app con todo lo que te toca, con contador de no leídos.
- **Correo inmediato** solo cuando te mencionan o te asignan algo.
- **Resumen diario** por correo con el resto (comentarios en lo que sigues), a la hora local
  de cada persona.
- **Recordatorio** de tareas tuyas que vencen mañana.
- Preferencia por cuenta: inmediato, solo resumen o nunca.
- Regla: si cada comentario manda un correo, la gente apaga todo. Por defecto, poco correo.

### 8. Vista del cliente

- Cada elemento tiene un interruptor **"Visible para el cliente"**. Por defecto, apagado.
- El cliente solo ve los elementos visibles de los proyectos donde es miembro.
- Reglas:
  - Un elemento nunca es más visible que el que lo contiene (una tarea oculta dentro de una
    lista visible no se ve; una tarea visible dentro de una lista oculta tampoco).
  - Lo que crea un cliente nace visible.
  - Un comentario hereda la visibilidad de lo que comenta.
- El cliente puede comentar y subir archivos en lo que ve.
- La regla vale en todo: pantallas, actividad, búsqueda, correos y bandeja. Es el error más
  grave posible y por eso tiene tests propios.

### 9. Actividad y papelera

- **Actividad del proyecto:** quién hizo qué y cuándo (creó, completó, comentó, asignó, subió
  versión, movió, borró, restauró, cambió visibilidad). El cliente solo ve la actividad de lo
  visible.
- **Papelera:** lo borrado se recupera durante 30 días; después un job lo elimina.

### 10. Transversal

- Usable en celular (diseño responsive; app nativa no).
- Búsqueda simple por título y texto dentro de la cuenta, respetando la visibilidad.
- Exportar todos los datos de la cuenta en un ZIP (dueño).

## Permisos por rol

| Acción | Dueño | Admin | Equipo | Cliente |
|---|---|---|---|---|
| Ver todos los proyectos | ✓ | ✓ | solo donde es miembro | solo donde es miembro |
| Crear proyecto | ✓ | ✓ | ✓ | no |
| Invitar equipo | ✓ | ✓ | no | no |
| Invitar cliente a un proyecto | ✓ | ✓ | ✓ | no |
| Ver contenido interno | ✓ | ✓ | ✓ | no |
| Crear tareas, mensajes, archivos | ✓ | ✓ | ✓ | ✓ (nacen visibles) |
| Comentar | ✓ | ✓ | ✓ | en lo visible |
| Cambiar visibilidad para clientes | ✓ | ✓ | ✓ | no |
| Editar o borrar lo ajeno | ✓ | ✓ | no | no |
| Cerrar la cuenta, exportar | ✓ | no | no | no |

## Fuera del MVP

| Módulo | Por qué espera | Fase |
|---|---|---|
| Chat por proyecto | Lo más caro técnicamente (tiempo real, no leídos, reconexión), compite con WhatsApp y dispersa decisiones. Decidido 2026-10-24 | 2, si el uso lo pide |
| WhatsApp | Depende de trámites con Meta; ver [06](06-WHATSAPP-FUTURO.md). Decidido 2026-10-24 | 2 |
| Aprobaciones de piezas | Diferenciador; conviene diseñarlo con uso real | 2 |
| Plantillas de proyecto | Se definen mejor después de usar la herramienta | 2 |
| Calendario e hitos | No bloquea el uso diario | 2 |
| Check-ins automáticos ("¿qué hiciste hoy?") | Útil para equipos más grandes | 2 |
| Hill charts o barra de progreso | Opcional | 2 |
| Conexión con el CRM | Lead ganado → proyecto | 2 |
| Búsqueda avanzada (filtros, Meilisearch) | Postgres alcanza al inicio | 2 o 3 |
| Cobros, registro con prueba, superadmin | Solo para vender | 3 |
| Dominio propio por cliente | Si lo piden | 3 |
| App móvil nativa | El responsive alcanza | Más adelante |
| Facturación, control de horas, Gantt | No es el foco | No previsto |
