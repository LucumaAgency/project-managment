/**
 * Revisa que la base del servidor quedó como el aislamiento entre cuentas necesita (D-44).
 * Se corre en Plesk → Node.js → Run script, antes y después de `prisma:deploy`:
 *
 *   npm run base:verificar:prod
 *
 * No cambia nada: solo lee y dice OK o FALLA por punto. Sale con código 1 si algo falla.
 */
import { prisma, prismaAdmin } from '../db.js';
import { buscarHerramienta, listarRespaldos } from '../services/respaldo.js';
import { claveNueva, hayClaveAccesos } from '../lib/cifrado.js';
import { env } from '../env.js';

type Fila = Record<string, unknown>;
let fallas = 0;
const ok = (texto: string) => console.log(`  OK     ${texto}`);
const aviso = (texto: string, arreglo: string) => console.log(`  AVISO  ${texto}\n         → ${arreglo}`);
const falla = (texto: string, arreglo: string) => {
  fallas++;
  console.log(`  FALLA  ${texto}\n         → ${arreglo}`);
};
const uno = async <T extends Fila>(c: typeof prisma, sql: string, ...valores: unknown[]) =>
  (await c.$queryRawUnsafe<T[]>(sql, ...valores))[0];

async function main() {
  console.log('Base de datos de Lucuma Proyectos\n');

  const app = await uno<{ usuario: string; version: number; texto: string }>(
    prisma,
    `SELECT current_user AS usuario, current_setting('server_version_num')::int AS version, current_setting('server_version') AS texto`
  );
  const admin = await uno<{ usuario: string; crear: boolean }>(
    prismaAdmin,
    `SELECT current_user AS usuario, has_schema_privilege(current_user, 'public', 'CREATE') AS crear`
  );

  console.log(`Postgres ${app.texto} · API conecta como "${app.usuario}" · migraciones como "${admin.usuario}"\n`);

  // Probado con 12.22 (la del servidor de Plesk) y 16.14 (local y CI), D-45.
  if (app.version >= 120000) ok('PostgreSQL 12 o más');
  else falla(`PostgreSQL ${app.texto} es muy viejo`, 'Hace falta 12 o más.');

  // Plesk antepone el usuario de la suscripción (carlosm_pm_admin): el de la app tiene que ser
  // el mismo nombre con pm_app, que es lo que buscan las migraciones (D-45).
  const esperado = admin.usuario.replace('pm_admin', 'pm_app');
  if (admin.usuario.endsWith('pm_admin')) ok(`DATABASE_ADMIN_URL usa "${admin.usuario}"`);
  else falla(`DATABASE_ADMIN_URL usa "${admin.usuario}"`, 'Tiene que ser el usuario que termina en pm_admin (dueño de la base).');
  if (app.usuario === esperado && app.usuario !== admin.usuario) ok(`DATABASE_URL usa "${app.usuario}"`);
  else falla(`DATABASE_URL usa "${app.usuario}"`, `Tiene que ser "${esperado}".`);

  if (admin.crear) ok(`${admin.usuario} puede crear tablas en el esquema public`);
  else falla(`${admin.usuario} no puede crear tablas`, 'Tiene que ser el dueño de la base (el primer usuario al crearla en Plesk).');

  const rol = await uno<{ superuser: boolean; bypass: boolean; miembro: boolean }>(
    prisma,
    `SELECT r.rolsuper AS superuser, r.rolbypassrls AS bypass,
            pg_has_role(current_user, $1, 'MEMBER') AS miembro
     FROM pg_roles r WHERE r.rolname = current_user`,
    admin.usuario
  ).catch(() => null);
  if (rol && !rol.superuser && !rol.bypass) ok(`${app.usuario} no es superusuario ni salta RLS`);
  else falla(`${app.usuario} tiene privilegios de más`, 'Tiene que ser un usuario común, sin SUPERUSER ni BYPASSRLS.');
  if (rol && !rol.miembro) ok(`${app.usuario} no es miembro de ${admin.usuario}`);
  else falla(`${app.usuario} es miembro de ${admin.usuario}: heredaría el acceso total del dueño`, 'Quitar esa membresía (pedírselo al hosting si no se puede desde Plesk).');

  const tablas = await uno<{ total: number; deApp: number; ajenas: number; sinRls: number }>(
    prismaAdmin,
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE pg_get_userbyid(c.relowner) = $1)::int AS "deApp",
            count(*) FILTER (WHERE pg_get_userbyid(c.relowner) <> current_user)::int AS ajenas,
            count(*) FILTER (WHERE NOT c.relrowsecurity
                             AND c.relname NOT IN ('users','login_tokens','sessions','jobs','_prisma_migrations'))::int AS "sinRls"
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    app.usuario
  );
  if (tablas.total === 0) {
    console.log('\n  (Todavía no hay tablas: correr prisma:deploy y volver a verificar.)');
  } else {
    if (tablas.deApp === 0 && tablas.ajenas === 0) ok(`las ${tablas.total} tablas son de ${admin.usuario}`);
    else falla(`hay tablas que no son de ${admin.usuario}`, 'Las migraciones se tienen que correr con DATABASE_ADMIN_URL (el usuario pm_admin).');
    if (tablas.sinRls === 0) ok('todas las tablas con datos de cuenta tienen RLS');
    else falla(`${tablas.sinRls} tablas sin RLS`, 'Falta aplicar migraciones: prisma:deploy.');
    const visibles = await uno<{ n: number }>(prisma, 'SELECT count(*)::int AS n FROM projects');
    if (visibles.n === 0) ok(`${app.usuario} sin cuenta fijada no ve ningún proyecto (RLS funciona)`);
    else falla(`${app.usuario} ve ${visibles.n} proyectos sin cuenta fijada`, 'RLS no está aislando. NO usar la app hasta arreglarlo.');
  }

  // Respaldo diario (D-60): no es una falla de la base, pero sin pg_dump no hay respaldo propio.
  console.log('\nRespaldo');
  const mayor = Math.floor(app.version / 10_000);
  const pgDump = await buscarHerramienta('pg_dump', mayor);
  if (!pgDump) aviso('no se encontró pg_dump', 'Sin él no hay respaldo diario propio. Buscar dónde está (p. ej. /usr/lib/postgresql/12/bin) y ponerlo en PG_BIN_DIR, o usar solo las copias de Plesk.');
  else if (pgDump.version < mayor) aviso(`pg_dump ${pgDump.version} es más viejo que la base (${mayor})`, 'Poner en PG_BIN_DIR la carpeta de un pg_dump igual o más nuevo.');
  else if (pgDump.version > mayor) aviso(`pg_dump ${pgDump.version} es más nuevo que la base (${mayor})`, `Respalda bien, pero para restaurar en esta misma base conviene un pg_restore ${mayor}: si existe, ponerlo en PG_BIN_DIR.`);
  else ok(`pg_dump ${pgDump.version} (${pgDump.ruta})`);
  const respaldos = await listarRespaldos();
  if (respaldos.length) ok(`último respaldo: ${respaldos[0].dia} (${respaldos.length} guardados)`);
  else aviso('todavía no hay respaldos', 'Se hace solo con el latido (una vez al día) o a mano: respaldo:prod.');

  // Accesos protegidos (D-66): sin clave, las tareas no pueden guardar accesos.
  console.log('\nAccesos protegidos');
  if (hayClaveAccesos()) ok('ACCESOS_CLAVE configurada');
  else if (env.accesosClave) aviso('ACCESOS_CLAVE no sirve (tiene que ser de 64 caracteres hex)', `Reemplazarla en el .env, por ejemplo con: ACCESOS_CLAVE="${claveNueva()}" y reiniciar.`);
  else aviso('falta ACCESOS_CLAVE', `Agregar al .env esta línea (es nueva, sirve una sola vez) y reiniciar: ACCESOS_CLAVE="${claveNueva()}". Guardar una copia fuera del servidor: si se pierde, los accesos guardados no se pueden leer.`);

  console.log(fallas ? `\n${fallas} punto(s) con FALLA.` : '\nTodo en orden.');
  process.exitCode = fallas ? 1 : 0;
}

main()
  .catch((e) => {
    console.error('No se pudo conectar o consultar:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]));
