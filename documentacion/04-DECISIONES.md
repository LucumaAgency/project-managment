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
El CRM sufrió en Plesk porque el cron no funciona. Aquí el cron es necesario desde el día 1.

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
Sin membresía recibe 403 como cualquiera. El acceso de soporte llega con el superadmin (fase 3)
y quedará en `AuditLog`.

**D-26 · Login único para todas las cuentas** (2026-10-24, día 3)
Como la persona es global (D-08), entra una vez y la cookie vale para todos los subdominios.
Si tiene una sola cuenta va directo; si tiene varias, elige. Descartado: login por cuenta como
en el CRM.

**D-27 · Enlace mágico como forma principal de entrar** (2026-10-24, día 3)
La pantalla ofrece primero el enlace al correo y la contraseña como alternativa. Los clientes
de las agencias entran pocas veces y no recuerdan contraseñas. Ver C-5.

**D-28 · Los correos de acceso salen en la misma petición** (2026-10-24, día 3)
El enlace mágico tiene que llegar en segundos; no espera a la cola, que además se construye en
la semana 3. Los avisos y resúmenes sí irán por la cola.

**D-29 · Alta de cuentas por consola, adelantada al día 3** (2026-10-24, día 3)
`npm run cuenta:crear -- <slug> "<Nombre>" <correo> ["Nombre"] [--clave]`. Sin él no se podía
probar el login en local. Si la persona ya existe, se suma como dueña.

**D-30 · Estilos propios provisionales, sin shadcn/ui por ahora** (2026-10-24, día 3)
CSS con variables de color y modo oscuro. shadcn/ui (o la librería que se elija) entra cuando
esté definida la identidad del producto. Ver C-4.

## Operación

**D-20 · Repo público** (2026-10-24, decidido por el usuario)
https://github.com/LucumaAgency/project-managment. Implica: nunca subir `.env`, claves ni datos
de clientes (el `.gitignore` los excluye).

**D-21 · Cobros: Paddle o Lemon Squeezy afuera; Culqi o Mercado Pago en Perú** (2026-10-24)
Stripe no acepta comercios con sede en Perú. Se decide en la fase 3.
