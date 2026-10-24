// Postgres 16 local para desarrollo, sin instalar nada en el sistema.
//
//   npm run db:local        (dejarlo corriendo en otra terminal; Ctrl+C lo apaga)
//
// Usa los binarios del paquete `embedded-postgres` y guarda los datos en .pgdata/ (fuera de git).
// La primera vez crea los dos roles y la base, igual que se hará en el servidor:
//   pm_admin → dueño de las tablas, BYPASSRLS. Migraciones, worker, superadmin.
//   pm_app   → la API. Sin privilegios: Row Level Security aplica a todas sus consultas.
// En producción los roles se crean a mano con contraseñas reales (docs/DESARROLLO.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(raiz, '.pgdata');
const PUERTO = Number(process.env.PG_LOCAL_PORT ?? 5433);
const BASE = 'lucuma_pm';
const primeraVez = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));

// Servidores sin locale configurado (LANG vacío) hacen fallar initdb. Locale C + UTF-8 no
// depende del sistema; el orden alfabético con tildes se resuelve en las consultas, no aquí.
process.env.LANG = 'C';
process.env.LC_ALL = 'C';

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: PUERTO,
  persistent: true,
  initdbFlags: ['--locale=C', '--encoding=UTF8'],
  onLog: () => {},
});

if (primeraVez) await pg.initialise();
await pg.start();

const cliente = pg.getPgClient();
await cliente.connect();
const existe = async (sql, v) => (await cliente.query(sql, v)).rowCount > 0;

if (!(await existe('SELECT 1 FROM pg_roles WHERE rolname = $1', ['pm_admin']))) {
  await cliente.query(`CREATE ROLE pm_admin LOGIN PASSWORD 'pm_admin_dev' BYPASSRLS CREATEDB`);
}
if (!(await existe('SELECT 1 FROM pg_roles WHERE rolname = $1', ['pm_app']))) {
  await cliente.query(`CREATE ROLE pm_app LOGIN PASSWORD 'pm_app_dev' NOBYPASSRLS`);
}
if (!(await existe('SELECT 1 FROM pg_database WHERE datname = $1', [BASE]))) {
  await cliente.query(`CREATE DATABASE ${BASE} OWNER pm_admin`);
}
await cliente.end();

console.log(`Postgres local en localhost:${PUERTO} (base ${BASE}). Ctrl+C para apagar.`);

const apagar = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
// Mantener el proceso vivo mientras Postgres corre.
setInterval(() => {}, 1 << 30);
