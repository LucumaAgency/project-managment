/**
 * Revisa que la base del servidor quedó como el aislamiento entre cuentas necesita (D-44).
 * Se corre en Plesk → Node.js → Run script, antes y después de `prisma:deploy`:
 *
 *   npm run base:verificar:prod
 *
 * No cambia nada: solo lee y dice OK o FALLA por punto. Sale con código 1 si algo falla.
 */
import { prisma, prismaAdmin } from '../db.js';

type Fila = Record<string, unknown>;
let fallas = 0;
const ok = (texto: string) => console.log(`  OK     ${texto}`);
const falla = (texto: string, arreglo: string) => {
  fallas++;
  console.log(`  FALLA  ${texto}\n         → ${arreglo}`);
};
const uno = async <T extends Fila>(c: typeof prisma, sql: string) => (await c.$queryRawUnsafe<T[]>(sql))[0];

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

  if (app.version >= 130000) ok('PostgreSQL 13 o más');
  else falla(`PostgreSQL ${app.texto} es muy viejo`, 'Hace falta 13 o más (ideal 16).');

  if (app.usuario === 'pm_app') ok('DATABASE_URL usa el usuario pm_app');
  else falla(`DATABASE_URL usa "${app.usuario}"`, 'Tiene que ser pm_app (el nombre está en las migraciones).');

  if (admin.usuario === 'pm_admin') ok('DATABASE_ADMIN_URL usa el usuario pm_admin');
  else falla(`DATABASE_ADMIN_URL usa "${admin.usuario}"`, 'Tiene que ser pm_admin.');

  if (admin.crear) ok('pm_admin puede crear tablas en el esquema public');
  else falla('pm_admin no puede crear tablas', 'pm_admin tiene que ser el dueño de la base (el primer usuario al crearla en Plesk).');

  const rol = await uno<{ superuser: boolean; bypass: boolean; miembro: boolean }>(
    prisma,
    `SELECT r.rolsuper AS superuser, r.rolbypassrls AS bypass,
            pg_has_role(current_user, 'pm_admin', 'MEMBER') AS miembro
     FROM pg_roles r WHERE r.rolname = current_user`
  ).catch(() => null);
  if (rol && !rol.superuser && !rol.bypass) ok('pm_app no es superusuario ni salta RLS');
  else falla('pm_app tiene privilegios de más', 'pm_app debe ser un usuario común, sin SUPERUSER ni BYPASSRLS.');
  if (rol && !rol.miembro) ok('pm_app no es miembro de pm_admin');
  else falla('pm_app es miembro de pm_admin: heredaría el acceso total del dueño', 'Quitar esa membresía (REVOKE pm_admin FROM pm_app).');

  const tablas = await uno<{ total: number; deApp: number; ajenas: number; sinRls: number }>(
    prismaAdmin,
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE pg_get_userbyid(c.relowner) = 'pm_app')::int AS "deApp",
            count(*) FILTER (WHERE pg_get_userbyid(c.relowner) <> 'pm_admin')::int AS ajenas,
            count(*) FILTER (WHERE NOT c.relrowsecurity
                             AND c.relname NOT IN ('users','login_tokens','sessions','jobs','_prisma_migrations'))::int AS "sinRls"
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'`
  );
  if (tablas.total === 0) {
    console.log('\n  (Todavía no hay tablas: correr prisma:deploy y volver a verificar.)');
  } else {
    if (tablas.deApp === 0 && tablas.ajenas === 0) ok(`las ${tablas.total} tablas son de pm_admin`);
    else falla('hay tablas que no son de pm_admin', 'Las migraciones se tienen que correr con DATABASE_ADMIN_URL (pm_admin).');
    if (tablas.sinRls === 0) ok('todas las tablas con datos de cuenta tienen RLS');
    else falla(`${tablas.sinRls} tablas sin RLS`, 'Falta aplicar migraciones: prisma:deploy.');
    const visibles = await uno<{ n: number }>(prisma, 'SELECT count(*)::int AS n FROM projects');
    if (visibles.n === 0) ok('pm_app sin cuenta fijada no ve ningún proyecto (RLS funciona)');
    else falla(`pm_app ve ${visibles.n} proyectos sin cuenta fijada`, 'RLS no está aislando. NO usar la app hasta arreglarlo.');
  }

  console.log(fallas ? `\n${fallas} punto(s) con FALLA.` : '\nTodo en orden.');
  process.exitCode = fallas ? 1 : 0;
}

main()
  .catch((e) => {
    console.error('No se pudo conectar o consultar:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]));
