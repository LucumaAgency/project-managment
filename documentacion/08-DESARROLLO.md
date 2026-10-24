# 08. Desarrollo y base de datos

> Parte de la [documentación](00-INDICE.md). Estado y pendientes: [09-AVANCE.md](09-AVANCE.md).

## Correr en local

Requisitos: Node 20 o 22. No hace falta instalar Postgres.

```bash
npm install
cp .env.example .env          # valores de desarrollo, ya apuntan al Postgres local
npm run db:local              # terminal 1: Postgres 16 en localhost:5433 (Ctrl+C apaga)
npm run prisma:deploy         # aplica las migraciones
npm run dev                   # terminal 2: API en :3100 y web en :5174
```

Abrir http://localhost:5174 (carpeta local: `~/project-management`): debe decir «API y base OK (Postgres 16.x)».
Comprobación directa: `curl localhost:3100/api/v1/salud` → `"rol":"pm_app"`.

`npm run db:local` usa el paquete `embedded-postgres` (binarios de Postgres dentro de
node_modules) y guarda los datos en `.pgdata/` (fuera de git). La primera vez crea los
roles y la base. Para empezar de cero: apagarlo y borrar `.pgdata/`.

## Primera cuenta en local

```bash
npm run cuenta:crear -- lucuma "Lucuma Agency" tu@correo.com "Tu Nombre"
```

Crea la cuenta con su dueño e imprime la contraseña **una sola vez** (en el MVP no hay correo).
Si el correo ya existe (es dueño o miembro de otra cuenta), se suma como dueño y conserva su
contraseña; con `--clave` se le genera una nueva.

Luego abrir http://localhost:5174 → Entrar. Con una sola cuenta entra directo a ella.

Subdominios como en producción (opcional): `BASE_DOMAIN=lvh.me` en `.env`, reiniciar la API y
abrir http://lucuma.lvh.me:5174 (la raíz es http://lvh.me:5174).

## Soporte de personas (consola)

```bash
npm run usuario -- clave tu@correo.com            # contraseña nueva (se imprime una vez) y cierra sus sesiones
npm run usuario -- soporte tu@correo.com          # lo marca como soporte de Lucuma
npm run usuario -- soporte tu@correo.com --quitar # le quita la marca
```

En el servidor, con la API compilada: `npm run usuario:prod -- …` y `npm run cuenta:crear:prod -- …`.
Soporte entra a cualquier cuenta como admin mientras `SOPORTE_BETA` no sea `0` (D-31).

## Recorridos en navegador

Con dos o más ventanas abiertas a la vez, el modo desarrollo de Vite (cientos de archivos
sueltos) deja al navegador sin recursos (`ERR_INSUFFICIENT_RESOURCES`). Para recorridos largos:
`npm run build -w @lucuma-pm/web` y usar la API en `http://localhost:3100`, que sirve la web
compilada (reiniciar la API después de compilar: registra los archivos al arrancar).

## Probar el editor en local

Con la API y la web corriendo, entrar y abrir http://localhost:5174/_editor?cuenta=lucuma: guarda
un mensaje de prueba en el primer proyecto y muestra el HTML que armó el servidor. Esa página
solo existe en desarrollo (no llega al build de producción).

## Invitar en local

Personas → Invitar → copiar el enlace y abrirlo en otra ventana privada (o en otro navegador):
la persona nueva pone su nombre y una contraseña y entra. Si el correo ya tiene usuario, pide
su contraseña.

## Tests

```bash
npm test          # compila shared y corre vitest en packages/api
npm run typecheck # tipos de shared, api (incluidos los tests) y web
```

No necesitan `npm run db:local`: cada corrida levanta su propio Postgres 16 temporal (con
usuarios `plesk_pm_admin` / `plesk_pm_app`, como en Plesk), aplica las migraciones y lo borra al
terminar. Para probar contra otro Postgres (por ejemplo la versión del servidor), con una base
vacía: `TEST_PG_URL_APP=… TEST_PG_URL_ADMIN=… npm test`. GitHub Actions (`.github/workflows/ci.yml`) corre
tipos y tests en cada push a `main` y en cada PR.

El respaldo real (`respaldo.test.ts`) necesita un `pg_dump` 16 o más nuevo: lo busca en el
sistema o en `TEST_PG_BIN_DIR=/carpeta/con/pg_dump`. Si no hay, ese test se salta con un aviso.

| Archivo | Qué prueba |
|---|---|
| `test/aislamiento.test.ts` | Toda tabla con datos de cuenta tiene RLS activado, forzado y con política; sin cuenta no se ve nada; cada cuenta ve exactamente lo suyo; no se puede crear, modificar, mover ni borrar en otra cuenta; la búsqueda respeta la cuenta; la cuenta no se filtra entre conexiones del pool; una persona en dos cuentas; `invitacion_por_token()` solo con el hash exacto; `cuentas_para_soporte()` vacía para quien no es staff |
| `test/http-contexto.test.ts` | `/yo` y `/mis-cuentas` por HTTP: 200, 400, 401, 403, 404, 410; sesión vencida o inventada; membresía desactivada; cuenta cerrada; subdominio y que con subdominio no se pueda cambiar de cuenta por parámetro |
| `test/auth.test.ts` | Enlace mágico (queda listo para cuando haya correo) (un uso, vencido, correo inexistente sin aviso, freno de pedidos, enlace armado con el dominio configurado y no con el Host), contraseña (correcta, mismo 401 para todo fallo, bloqueo tras 5 fallos), sesión, sesión que se renueva con el uso (y la vencida no revive), salir invalida la cookie, cookie para todos los subdominios, cambio de contraseña cierra las otras sesiones, rechazo de `text/plain` |
| `test/invitaciones.test.ts` | Invitaciones: quién invita a quién, proyecto de otra cuenta, reemplazo, enlace de un uso, vencida, renovada, anulada; persona nueva crea su contraseña y entra con el rol y el proyecto; persona existente necesita su sesión (el enlace no da su identidad); no baja el rol de quien ya estaba; desde otra cuenta 404. Límite del plan (cuenta pendientes, no clientes, se revisa al aceptar y al pasar a equipo). Personas: listar, desactivar corta el acceso, reglas de dueño y de uno mismo. Soporte en beta: entra como admin, queda registrado, lista cuentas; con `SOPORTE_BETA=0` no entra. `/config` sin correo |
| `test/proyectos.test.ts` | Proyectos: quién crea, quién ve (owner todo; equipo y cliente solo los suyos; otra cuenta 404), detalle con permisos y sin correos para el cliente, editar, archivar (solo lectura) y reactivar, papelera y restaurar, límite del plan. Personas del proyecto. Elementos: dónde va cada tipo, posiciones, editar (creador o admin), papelera con lo de adentro y restaurar, eventos. Visibilidad para clientes: no ve lo interno ni por lista, ni por id, ni lo que cuelga de algo interno; lo suyo nace visible; el comentario copia la visibilidad; solo el equipo la cambia |
| `test/documento.test.ts` | Procesador del editor: HTML y texto de un documento normal, escape de `<script>` y comillas, enlaces `javascript:`/`data:` descartados, `href` y etiqueta de mención escapados, nodos y formatos desconocidos rechazados, atributos inventados ignorados, límites de anidado y tamaño |
| `test/editor.test.ts` | Cuerpo con el editor por HTTP (HTML seguro, búsqueda, documento inválido no guarda nada, texto plano compatible, comentario vacío) y menciones (solo quien ve el proyecto, nunca un cliente en algo interno, editar y cambiar visibilidad las recalculan, lista del @) |
| `test/tareas.test.ts` | Listas y tareas (fecha, responsables, notas, orden), fechas inválidas, responsables válidos (nunca de fuera, ni de otra cuenta, ni clientes en algo interno; salen al pasar a interna), completar y reabrir (equipo; cliente solo lo suyo o asignado; nada en archivados), lo que ve un cliente, mover (reordenar, otra lista, 40 inserciones en el mismo hueco, destinos inválidos) |
| `test/comentarios.test.ts` | Comentar (HTML seguro, orden, contador en tareas, permisos de editar y borrar, el documento solo para el propio), no se comenta un comentario ni lo que está en la papelera ni otra cuenta, el cliente comenta en lo visible y no ve lo interno, quién sigue (crea, comenta, mencionado, asignado; nunca un cliente en algo interno), seguir y dejar de seguir a mano |
| `test/mensajes.test.ts` | Mensajes (extracto, contador, un comentario sube el mensaje, el cliente ve solo los visibles, otra cuenta 404) y actividad (orden, nombres de asignados, extracto y padre del comentario, eventos del proyecto, paginación sin repetidos, el cliente ve solo lo visible hoy y deja de ver lo que pasa a interno, lo borrado sin enlace para el equipo y oculto para el cliente) |
| `test/archivos.test.ts` | Subir y bajar (huella, clave sin nombre, encabezados seguros), HTML/SVG disfrazados nunca en línea, PDF en línea, nombre limpio, vacío 400 y demasiado grande 413 sin dejar nada (también por partes), espacio del plan, versiones (la anterior queda), carpetas con ruta, comentar un archivo, el cliente no baja lo de una carpeta interna ni con el enlace, sube en lo visible, no versiona lo ajeno, otra cuenta 404, sin sesión 401 |
| `test/bandeja.test.ts` | A quién le llega qué (mención que abre lo comentado, quien escribe no recibe, seguidores con una sola fila por persona, asignar, completar, mensaje nuevo solo a quien lo ve, al editar solo los nuevos mencionados, desactivados no), el cliente nunca se entera de lo interno (ni lo nuevo ni lo viejo tras pasar a interno), la bandeja (frase, contador, leer uno, al abrir, todo), nadie ve ni marca la bandeja ajena, la bandeja es por cuenta |
| `test/recordatorios.test.ts` | Vence mañana al responsable una sola vez (también calculado en paralelo), sin responsable a quien la creó, vencida, completada o lejana no, cliente solo si es visible, nada de papelera ni archivados, cómo se ve en la bandeja, se calcula al usar la app, latido (503 sin token, 401, 200), días en la zona de la cuenta |
| `test/cliente.test.ts` | **Auditoría de fugas**: 28 rutas (incluida la búsqueda) recorridas como cliente sin que aparezca nada interno; 16 accesos directos a lo interno dan 404 (la papelera 403); 8 escrituras sobre lo interno rechazadas; el espacio usado no se le muestra; lo que el equipo ve de la vista del cliente; cambiar la visibilidad de una carpeta ya creada |
| `test/purga.test.ts` | Lo de más de 30 días se borra con lo de adentro y lo reciente no; archivos (todas las versiones) fuera del disco y el espacio vuelve a bajar; proyecto entero; solo la cuenta que purga; correrla dos veces; subida en curso se respeta |
| `test/busqueda.test.ts` | Normalizar/marcar/fragmento; sin tildes y por prefijo; comentario abre lo comentado; papelera (también la del padre) fuera; proyectos por nombre; una letra no busca; el cliente solo lo visible con la cadena; quien no está en el proyecto; otra cuenta; pasar a interno lo saca |
| `test/exportar.test.ts` | Nombres seguros y sin repetir; ZIP con cuenta, datos, CSV (BOM, fórmulas escapadas), mensajes HTML limpios, archivos con versiones; solo su cuenta; archivo faltante avisado en LEEME; admin, miembro, cliente y soporte 403; registro de seguridad |
| `test/respaldo.test.ts` | Conexión sin clave ni `?schema`; rotación (deja N y sus listas, no toca la copia previa a restaurar); sin pg_dump, motivo claro; con pg_dump (TEST_PG_BIN_DIR o del sistema): respaldar, restaurar en una base aparte y comparar datos, RLS, funciones y migraciones |
| `test/sentry.test.ts` | DSN, pila a marcos, sin DSN nada, el mismo error una vez por minuto, Sentry caído no rompe; un 500 llega con ruta/cuenta/persona y sin query ni correos; 404/403 no se reportan; `/config` |
| `test/carga.test.ts` | Probar no guarda; carga proyecto, personas, listas, tareas (fecha, responsable, notas) y mensajes; la segunda vez salta; rechazos con motivo |
| `test/planes.test.ts` | `planPermite()`, excepciones por cuenta (ignora valores raros), plan desconocido, `puedeInvitar()` |
| `test/host.test.ts` | Lectura del host: subdominio, raíz, reservados, dominios ajenos |
| `test/semilla.ts` | Crea una cuenta con filas en **todas** las tablas con RLS (un test verifica que ninguna quede vacía) |

Comprobado el 2026-10-24: con el RLS de una sola tabla apagado a propósito, 4 tests fallan; con el filtro de visibilidad para clientes quitado, 3; con el filtro de mensajes quitado, la auditoría de fugas falla.

**Al agregar una tabla nueva:** si lleva `accountId` o cuelga de un recording, el test de
estructura falla hasta que tenga su RLS y su política; además hay que sumarla a la semilla.
Si de verdad no debe tener RLS, se agrega a `SIN_RLS` en el test con el motivo.

## Usar el contexto en una ruta

```ts
app.get('/api/v1/proyectos', async (req) => {
  const { ctx, rol } = exigirCuenta(req);           // 400/401/403/404/410 si no corresponde
  return conCuenta(ctx, (tx) => tx.project.findMany()); // RLS ya filtra por cuenta
});
```

Nunca importar `prismaAdmin` en una ruta de usuario.

## Los dos roles de la base

| Rol | Quién lo usa | RLS |
|---|---|---|
| `pm_admin` | Migraciones, worker que recorre varias cuentas, scripts de consola, superadmin | No: es el dueño de las tablas, que no tienen FORCE (D-44). Sin BYPASSRLS, como en Plesk |
| `pm_app` | La API, en cada petición | Sí: solo ve la cuenta fijada en la transacción |

En el código: `prisma` (pm_app) para las rutas y `prismaAdmin` (pm_admin) para lo demás
(`packages/api/src/db.ts`). Una ruta de usuario nunca importa `prismaAdmin`.

Prisma usa `DATABASE_URL` (pm_app) para consultar y `DATABASE_ADMIN_URL` (pm_admin, como
`directUrl`) para migrar.

## Cómo funciona el aislamiento

Cada petición corre en una transacción que empieza con:

```sql
SELECT set_config('app.account_id', '<cuenta>', true), set_config('app.user_id', '<usuario>', true);
```

Las políticas de la migración `rls_busqueda` comparan `accountId` con esa variable. Sin
variable, `pm_app` no ve ninguna fila. Probado (2026-10-24): sin cuenta no ve nada, la
cuenta A no lee, busca, inserta ni modifica filas de la B.

Tablas sin RLS a propósito: `users`, `login_tokens`, `sessions` (el login ocurre antes de
saber la cuenta) y `jobs` (el worker fija la cuenta por job).

## Búsqueda

`recordings.search` (tsvector, título con peso A y texto con peso B) lo llena un trigger.
No es columna GENERATED porque Prisma la lee como DEFAULT e intentaría borrarlo en cada
migración. Consulta: `WHERE search @@ plainto_tsquery('simple', $1)`.

## Migraciones

- Cambio de modelo: editar `schema.prisma` → `npx prisma migrate dev --name <nombre>`.
- Revisar que no haya diferencias:
  `npx prisma migrate diff --from-url "$DATABASE_ADMIN_URL" --to-schema-datamodel prisma/schema.prisma --script`
  debe decir «empty migration».
- Prisma bloquea `migrate reset` cuando lo ejecuta una IA: se corre a mano, o se borra `.pgdata/`.
- Las migraciones escritas a mano hasta hoy: `rls_busqueda`, `busqueda_por_trigger`, `resolver_cuenta`.
- Políticas, triggers y permisos van en SQL a mano dentro de una migración (`--create-only`).
  Las tablas nuevas heredan los permisos de `pm_app`, pero **RLS no**: cada tabla nueva con
  `accountId` necesita su `ENABLE ROW LEVEL SECURITY` y su política. **Sin FORCE** (D-44): si una
  tabla tuviera FORCE, `pm_admin` dejaría de verla y fallarían los scripts y la semilla de tests.

## Servidor (una vez, antes del primer despliegue)

Guía completa de Plesk en [10-DESPLIEGUE-PLESK.md](10-DESPLIEGUE-PLESK.md). No hace falta
superusuario: una base con dos usuarios comunes, `pm_admin` (dueño de la base) y `pm_app`.
Luego `npm run prisma:deploy` con `DATABASE_ADMIN_URL` apuntando a `pm_admin`, y
`npm run base:verificar:prod` para confirmar que quedó bien.
`pm_admin` en el servidor no necesita CREATEDB: `migrate deploy` no usa base temporal.
