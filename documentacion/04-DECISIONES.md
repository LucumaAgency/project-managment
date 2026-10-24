# 04. Decisiones

Cada decisión con su fecha, el motivo y lo que se descartó. Si una decisión cambia, no se
borra: se marca como reemplazada y se agrega la nueva.

## Producto

**D-01 · Primero interno, después producto** (2026-10-24)
Se construye para Lucuma, se usa 1 o 2 meses y después se vende. Motivo: el uso real define el
producto y da casos para venderlo. Lo que encarece vender después no son módulos sino
decisiones de base, que por eso se toman desde el día 1 (D-08 a D-11).

**D-02 · Nicho: portal de clientes para agencias de LATAM** (2026-10-24)
No competir de frente con Basecamp, ClickUp o Asana. Diferenciarse en vista del cliente,
aprobaciones y WhatsApp.

**D-03 · MVP sin chat** (2026-10-24, decidido por el usuario)
Motivos: es la parte técnicamente más cara (tiempo real, no leídos, reconexión, notificaciones
que no saturen), compite con WhatsApp donde el equipo y los clientes ya están, y dispersa
decisiones que deberían quedar pegadas a la tarea o el archivo. Alternativa evaluada: chat simple
por proyecto (2 o 3 días extra). Puede volver en la fase 2 si el uso lo pide.

**D-04 · MVP sin WhatsApp** (2026-10-24, decidido por el usuario)
Depende de trámites con Meta (verificación, plantillas, Tech Provider) que en el CRM tomaron
semanas. Diseño listo para la fase 2 en [06](06-WHATSAPP-FUTURO.md).

**D-05 · Mensajes sí entran al MVP** (2026-10-24)
"Sin mensajería" se entendió como sin chat. Los mensajes (anuncios o temas del proyecto con
comentarios) se quedan porque ahí quedan el brief y las decisiones. Si se quisieran sacar, el
MVP baja medio día.

**D-06 · Correo con poco ruido por defecto** (2026-10-24)
Correo inmediato solo para menciones y asignaciones; lo demás va al resumen diario.

## Arquitectura

**D-07 · Construir el núcleo propio, no hacer fork** (2026-10-24)
Las apps open source completas (Plane, Leantime, Huly, OpenProject) traen una base de código
enorme en otro stack, licencias AGPL o complejidad alta, y conflictos con cada actualización.
Se usan librerías MIT para las partes difíciles (ver [05](05-OPEN-SOURCE.md)).

**D-08 · User global + Membership** (2026-10-24)
Una persona puede estar en varias cuentas. Descartado: usuario colgado de una sola cuenta (como
el CRM), porque cambiarlo después cuesta semanas.

**D-09 · Modelo Recording único** (2026-10-24)
Patrón de Basecamp. Descartado: una tabla de comentarios por tipo, que obliga a repetir
comentarios, menciones, papelera e historial para cada cosa.

**D-10 · Límites por plan desde el día 1** (2026-10-24)
`planes.ts` con plan `interno` sin límites. Cobrar después es configurar.

**D-11 · Fechas en UTC, idioma y zona horaria por persona** (2026-10-24)
Para vender fuera de Perú sin que los recordatorios lleguen a la hora equivocada.

**D-12 · PostgreSQL en vez de MariaDB** (2026-10-24)
El CRM usa MariaDB. Aquí Postgres por Row Level Security (la base bloquea el acceso entre
cuentas aunque el código olvide un filtro) y por la búsqueda con índice GIN sin servicio aparte.

**D-13 · Búsqueda mantenida por trigger, no por columna calculada** (2026-10-24, día 1)
Primero se hizo como columna `GENERATED`. Prisma lee la expresión como un valor por defecto y en
cada migración futura intentaría borrarlo, lo que falla sobre una columna calculada. Con trigger
el resultado es el mismo y Prisma no ve diferencias. El cambio quedó en una tercera migración
(`busqueda_por_trigger`) porque Prisma no permite que una IA reinicie la base sin permiso del
usuario, y ese bloqueo no se saltó.

**D-14 · Sin Redis en el MVP** (2026-10-24, día 1)
Al principio se propuso Redis + BullMQ. Al quitar el chat no hace falta tiempo real, y la cola
en la propia base (patrón del CRM, con `SKIP LOCKED`) alcanza. Un servicio menos. Reemplaza la
propuesta inicial de BullMQ.

**D-15 · Dos roles de base: pm_app y pm_admin** (2026-10-24, día 1)
La API nunca usa un rol que pueda saltarse RLS. Migraciones, worker multi-cuenta y superadmin
usan `pm_admin`.

**D-16 · Prisma 6.19, no 7 ni 8** (2026-10-24, día 1)
6.x es estable y se trabaja igual que el 5 del CRM. La 7 cambió bastante la configuración y la
8 está en versión candidata.

**D-17 · Fastify 5** (2026-10-24, día 1)
El CRM usa Fastify 4. Proyecto nuevo, versión actual.

**D-18 · Postgres local con embedded-postgres** (2026-10-24, día 1)
Sin permisos de administrador no se puede instalar Postgres en la máquina de desarrollo; el
paquete trae los binarios. Mismo Postgres 16 que en producción.

**D-19 · Hosting en Vultr + CloudPanel, no Plesk** (2026-10-24)
~~El CRM sufrió en Plesk porque el cron no funciona.~~ Para la beta, reemplazada por D-43: el
usuario quiere empezar en Plesk. Vultr + CloudPanel sigue siendo el destino cuando haga falta
cron real (el worker llega el día 11) o cuando se venda.

**D-22 · Tests con su propio Postgres** (2026-10-24, día 2)
Vitest 3.2. Cada corrida levanta un Postgres 16 temporal (embedded-postgres, puerto libre),
aplica las migraciones reales y lo borra al terminar. No toca la base de desarrollo y corre
igual en GitHub Actions. El CRM no tenía tests; aquí el test de aislamiento es obligatorio.

**D-23 · Funciones SECURITY DEFINER para lo previo a la cuenta** (2026-10-24, día 2)
`cuenta_por_slug` y `cuentas_de_usuario`. Alternativa descartada: usar `prismaAdmin` en el hook
de cada petición, que pondría un rol sin RLS en el camino de todas las peticiones.

**D-24 · En local la cuenta va por `?cuenta=` o `X-Cuenta`** (2026-10-24, día 2)
Sin `BASE_DOMAIN` no hay subdominios. Con `BASE_DOMAIN` (producción) esos dos se ignoran, para
que nadie cambie de cuenta con un parámetro (lo prueba un test).

**D-25 · Soporte (`isStaff`) no entra a cuentas ajenas todavía** (2026-10-24, día 2)
~~Sin membresía recibe 403 como cualquiera.~~ Reemplazada por D-31.

**D-26 · Login único para todas las cuentas** (2026-10-24, día 3)
Como la persona es global (D-08), entra una vez y la cookie vale para todos los subdominios.
Si tiene una sola cuenta va directo; si tiene varias, elige. Descartado: login por cuenta como
en el CRM.

**D-27 · Enlace mágico como forma principal de entrar** (2026-10-24, día 3)
~~La pantalla ofrece primero el enlace al correo.~~ Reemplazada por D-32: sin correo en el MVP.

**D-28 · Los correos de acceso salen en la misma petición** (2026-10-24, día 3)
El enlace mágico tiene que llegar en segundos; no espera a la cola, que además se construye en
la semana 3. Los avisos y resúmenes sí irán por la cola.

**D-29 · Alta de cuentas por consola, adelantada al día 3** (2026-10-24, día 3)
`npm run cuenta:crear -- <slug> "<Nombre>" <correo> ["Nombre"] [--clave]`. Sin él no se podía
probar el login en local. Si la persona ya existe, se suma como dueña.

**D-30 · Estilos propios provisionales, sin shadcn/ui por ahora** (2026-10-24, día 3)
~~Estilos neutros con modo oscuro.~~ Reemplazada por D-33.

**D-31 · Soporte de Lucuma entra a cualquier cuenta durante la beta** (2026-10-24, día 4, decidido por el usuario)
Quien tiene `isStaff` entra sin membresía con permisos de **administrador**: ve la lista de
todas las cuentas en el selector, la web muestra una franja ámbar "Estás como soporte", y cada
entrada queda en `audit_log` de esa cuenta (`soporte.acceso`, una vez por sesión y cuenta). Se
apaga con `SOPORTE_BETA=0`. La marca se da por consola (`npm run usuario -- soporte <correo>`),
nunca desde la web. Ver C-9.

**D-32 · Sin correo en el MVP: contraseña y enlaces que se comparten a mano** (2026-10-24, día 4, decidido por el usuario)
- Se entra con correo y contraseña. El acceso por enlace al correo sigue programado, pero la
  web solo lo muestra si hay SMTP (`/config` devuelve `correo: false`) y en producción sin SMTP
  la ruta responde 503.
- Las cuentas se crean por consola (`cuenta:crear`), que genera e imprime la contraseña del
  dueño nuevo.
- Las invitaciones generan un enlace que quien invita copia y manda (WhatsApp, Slack). La
  pantalla trae "Copiar", "Copiar mensaje" y "Abrir en WhatsApp" (solo `wa.me` con el texto,
  no es integración).
- Contraseña olvidada: la restablece soporte por consola (`npm run usuario -- clave <correo>`).
- Cuando haya correo, los mismos enlaces salen también por correo: no se reescribe nada.

**D-33 · El sistema visual del CRM** (2026-10-24, día 4, decidido por el usuario)
Mismos tokens (azul `#174FCA`, neutros, estados), Montserrat, wordmark "Lucuma Agency" con la
etiqueta del producto ("Proyectos"), menú lateral que en celular es cajón, tarjetas, tablas que
en celular pasan a tarjetas, modales que en celular son hoja inferior, íconos de trazo propios
y el favicon "LA". Solo modo claro, como el CRM. CSS propio, sin librería de componentes: así
los dos productos se ven iguales y no se suma peso. Fuente de verdad: el `styles.css` del CRM.

**D-34 · Invitaciones: el enlace es la llave, con tres resguardos** (2026-10-24, día 4)
Quien tiene el enlace puede aceptar. Por eso: vence a los 7 días, sirve una vez, se puede
anular o renovar (el anterior deja de servir) y en la base solo está su hash. Si el correo ya
tiene usuario, para aceptar hay que entrar con **su** contraseña: el enlace no da acceso a una
identidad que ya existe. Invitar de nuevo al mismo correo reemplaza la invitación pendiente.
A quien ya está activo no se le baja el rol al aceptar otra invitación (p. ej. como cliente de
un proyecto). Owner y admin invitan a cualquier rol menos dueño; el equipo solo invita clientes
y a un proyecto donde está.

**D-35 · Límite de usuarios del plan: cuenta el equipo, no los clientes** (2026-10-24, día 4)
Equipo activo + invitaciones de equipo vigentes. Las pendientes cuentan para que no se pueda
pasar el límite invitando de más. Se revisa al invitar, al aceptar (por si el límite bajó) y al
pasar a alguien de cliente a equipo o reactivarlo. La regla vive en `shared/planes.ts`
(`planPermite`, el `can()` del plan) para que web y API digan lo mismo.

**D-36 · Gestión de personas: al dueño y a uno mismo no se los toca** (2026-10-24, día 4)
Owner y admin cambian rol, desactivan y reactivan. El dueño no cambia por esta vía (la
transferencia de dueño llega aparte) y nadie se cambia a sí mismo, para no quedarse fuera por
error. Desactivar corta el acceso en la petición siguiente; no borra nada de lo que hizo.

**D-37 · La sesión se renueva con el uso** (2026-10-24, decidido por el usuario, C-3)
Vence tras 30 días **sin** entrar, no 30 días desde el login. Cada petición con una sesión
renovada hace más de un día corre su vencimiento a 30 días y repone la cookie; así se escribe
en la base como mucho una vez al día por sesión. Una sesión vencida no revive.

**D-38 · Día 12: recordatorios dentro de la app, no correos** (2026-10-24, decidido por el usuario, C-8)
Sin correo en el MVP (D-32), el día 12 se usa para avisos en la bandeja: tareas que vencen
mañana, tareas vencidas y lo que hoy iría al resumen diario. Un job diario los genera según la
zona horaria de cada persona. Cuando haya correo, el mismo job también lo envía.

**D-39 · Se quedan como están: soporte admin, enlace de 7 días, contraseña por soporte** (2026-10-24, decidido por el usuario, C-9 a C-11)
Soporte entra con permisos de administrador (D-31). El enlace de invitación dura 7 días y
sirve una vez (D-34). La contraseña olvidada la restablece soporte de Lucuma por consola (D-32);
las agencias no generan enlaces de contraseña para su equipo.

**D-40 · Permisos en una función pura, y 404 para lo que no se ve** (2026-10-24, día 5)
`puede(actor, accion, { proyecto, elemento })` en `services/permisos.ts` no toca la base:
recibe lo ya cargado (rol, si es miembro del proyecto, estado, visibilidad en cadena) y
responde sí o no. `exigir()` corta con **404** cuando ni siquiera se puede ver (proyecto ajeno,
algo interno para un cliente) y con 403 cuando se ve pero no se puede hacer. Así no se revela
que algo existe. Las rutas solo cargan con `proyectoPara()` / `elementoPara()` y preguntan.

**D-41 · Reglas de proyectos** (2026-10-24, día 5)
- Crea cualquiera menos el cliente; quien crea queda dentro.
- Editar nombre y descripción y gestionar personas: owner, admin o el equipo del proyecto.
- Archivar, reactivar, papelera y restaurar: solo owner y admin (decidido por el usuario, C-12).
- Archivado = solo lectura (se ve, no se cambia nada adentro). En papelera = solo lo ven owner
  y admin, para restaurarlo. Ver C-12.
- El límite de proyectos del plan cuenta solo los activos; se revisa al crear, reactivar y restaurar.
- El cliente ve los nombres de la gente del proyecto, no sus correos.

**D-42 · Elementos genéricos: tipos, padres y visibilidad** (2026-10-24, día 5)
- Dónde va cada tipo: lista en la raíz; tarea dentro de una lista; mensaje en la raíz; carpeta
  en la raíz o en otra carpeta; archivo en la raíz o en una carpeta; comentario dentro de lista,
  tarea, mensaje o archivo.
- Los archivos no se crean por la ruta genérica: nacen al confirmar una subida (día 10).
- El cliente solo crea tareas, mensajes y comentarios, siempre visibles, y solo dentro de algo
  que ve.
- Visibilidad en cadena: un cliente ve algo solo si él y todos sus padres son visibles. Se
  calcula con una consulta recursiva sobre `parentId`, que también pasa por RLS.
- Editar lo ajeno: listas y tareas, cualquiera del equipo del proyecto; mensajes y comentarios,
  solo su autor o un owner/admin (decidido por el usuario, C-13). Borrar lo ajeno: solo owner y admin.
- Papelera: se marca el elemento y lo de adentro deja de verse con él; restaurarlo devuelve
  todo. La papelera del proyecto muestra solo la raíz de cada borrado.
- Cada cambio escribe su `Event` en la misma transacción, con la visibilidad efectiva copiada.
- Hasta el día 6 el cuerpo es texto plano (`bodyText`); el editor agrega el JSON de Tiptap.

**D-43 · Beta en Plesk, con lo compilado en una rama aparte** (2026-10-24, decidido por el usuario)
Se despliega con el Git de Plesk, como el CRM: GitHub compila y el servidor solo hace pull
(no compila, no instala devDependencies). A diferencia del CRM, lo compilado no se commitea en
`main`: CI lo publica en la rama `produccion` (historia lineal armada con `commit-tree`), que
es la que jala Plesk. Así `main` queda limpio y nunca hay conflictos por `dist/`. La CLI de
Prisma pasó a `dependencies`. La API sirve el SPA para las rutas internas y escribe el log en
`logs/app.txt`. Guía: [10-DESPLIEGUE-PLESK.md](10-DESPLIEGUE-PLESK.md). Requisito: Postgres
con acceso de superusuario una vez (C-15).

**D-44 · RLS sin superusuario: el dueño de las tablas es el que ve todo** (2026-10-24)
En Plesk no hay root, así que nadie puede dar BYPASSRLS. Se usa la regla de fábrica de
Postgres: el dueño de una tabla no está sujeto a sus políticas salvo con FORCE. Migración
`rls_por_dueno` quita FORCE; `pm_admin` (corre las migraciones, por eso es dueño) ve todo y
`pm_app` sigue sujeto a RLS. Para `pm_app` no cambia nada. Condiciones que se vigilan con un test
y con `base:verificar:prod`: `pm_app` no es dueño de ninguna tabla, ni miembro de `pm_admin`
(probado: si lo fuera, vería todo), ni superusuario. En local y en los tests `pm_admin` ya no
tiene BYPASSRLS, para comportarse igual que el servidor. Descartado: pedir al hosting un
superusuario solo para esto.

**D-45 · Nombres de usuario con prefijo y PostgreSQL 12** (2026-10-24)
Plesk antepone el usuario de la suscripción (`carlosm_pm_admin`) y el servidor tiene PostgreSQL
12.22. Las migraciones ya no nombran a `pm_app`: lo deducen del que migra (`…pm_admin` →
`…pm_app`) y cortan con un mensaje claro si no existe. Se reescribieron tres migraciones que
solo se habían aplicado en la base local (se actualizó su huella ahí, sin perder datos). Los
tests corren siempre con usuarios `plesk_…` para cubrir el prefijo, y aceptan otra base con
`TEST_PG_URL_APP` / `TEST_PG_URL_ADMIN`. La suite completa pasó en PostgreSQL 12.22 con la base
a nombre del servidor (el caso más restrictivo). El piso de versión pasa de 13 a 12.

**D-46 · Archivos en el propio servidor, Node 21 y contraseñas actuales** (2026-10-24, decidido por el usuario)
- Los archivos (día 10) se guardan en el disco del servidor de Plesk, en una carpeta **fuera**
  del docroot (como `privados/` del CRM), y se sirven solo por la API a quien puede verlos. R2
  queda para después; el código de archivos se escribe detrás de una interfaz de almacenamiento
  para poder cambiar sin tocar el resto. Los archivos entran en el respaldo de la suscripción.
- Node se queda en 21.7.3: la suscripción no ofrece otra. La app ya funciona con ella
  (`arranque.cjs`, variables sin comillas).
- Las contraseñas de la base no se cambian por ahora.

**D-47 · Editor: el navegador manda JSON, el servidor arma el HTML** (2026-10-24, día 6)
Tiptap 2.27 (MIT) en la web; en el servidor, un procesador propio (`lib/documento.ts`, sin
dependencias) recorre el JSON con una lista cerrada de nodos y formatos: párrafo, título (2 y
3), listas, cita, código, separador, salto de línea, negrita, cursiva, tachado, código, enlace
y mención. Lo desconocido (imágenes, iframes, estilos) da 400; un enlace que no sea http(s) o
mailto se descarta y queda el texto. De ahí salen las tres formas del cuerpo (`body`,
`bodyHtml`, `bodyText`). Descartado: sanear HTML del navegador con una librería (más superficie
de ataque) y `@tiptap/html` en el servidor (necesita un DOM simulado). Imágenes dentro del texto
llegan con los archivos (día 10).

**D-48 · Menciones: solo quien puede ver lo que se escribió** (2026-10-24, día 6)
Las menciones salen del documento procesado en el servidor, nunca de una lista del navegador.
Se guardan solo las de personas activas que ven el proyecto (owner/admin, o miembros del
proyecto) y, si el elemento es interno, nunca las de clientes. Editar el texto o cambiar la
visibilidad las recalcula. La lista del @ (`/proyectos/:id/mencionables`) sigue la misma regla.
Los avisos a los mencionados llegan con la bandeja (día 11).

## Operación

**D-20 · Repo público** (2026-10-24, decidido por el usuario)
https://github.com/LucumaAgency/project-managment. Implica: nunca subir `.env`, claves ni datos
de clientes (el `.gitignore` los excluye).

**D-21 · Cobros: Paddle o Lemon Squeezy afuera; Culqi o Mercado Pago en Perú** (2026-10-24)
Stripe no acepta comercios con sede en Perú. Se decide en la fase 3.
