// Levanta un Postgres 16 con los binarios de `embedded-postgres` y deja creados los roles y
// la base del proyecto. Lo usan `db-local.mjs` (desarrollo) y el arranque de los tests.
//
// Roles (igual que en el servidor, ver documentacion/08-DESARROLLO.md):
//   pm_admin → dueño de las tablas (por eso ve todo, D-44). Migraciones, worker, consola.
//              Sin BYPASSRLS, igual que en Plesk, donde no hay superusuario para darlo.
//   pm_app   → la API. Sin privilegios: Row Level Security aplica a todas sus consultas.
import fs from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

// Servidores sin locale configurado (LANG vacío) hacen fallar initdb. Locale C + UTF-8 no
// depende del sistema.
process.env.LANG = 'C';
process.env.LC_ALL = 'C';

/**
 * @param {{ dataDir: string, puerto: number, base: string, persistente?: boolean, prefijo?: string }} opciones
 *   `prefijo`: se antepone a los roles, como hace Plesk (`carlosm_pm_admin`). Los tests usan
 *   `plesk_` para probar siempre ese caso (D-45).
 * @returns {Promise<{ detener: () => Promise<void>, urlApp: string, urlAdmin: string }>}
 */
export async function levantarPostgres({ dataDir, puerto, base, persistente = true, prefijo = '' }) {
  const admin = `${prefijo}pm_admin`;
  const app = `${prefijo}pm_app`;
  const primeraVez = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
  // Si el proceso anterior murió sin apagar Postgres, queda este archivo y no arranca.
  if (!primeraVez) fs.rmSync(path.join(dataDir, 'postmaster.pid'), { force: true });

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: puerto,
    persistent: persistente,
    initdbFlags: ['--locale=C', '--encoding=UTF8'],
    onLog: () => {},
    onError: () => {},
  });

  if (primeraVez) await pg.initialise();
  await pg.start();

  const cliente = pg.getPgClient();
  await cliente.connect();
  const existe = async (sql, v) => (await cliente.query(sql, v)).rowCount > 0;

  if (!(await existe('SELECT 1 FROM pg_roles WHERE rolname = $1', [admin]))) {
    // CREATEDB solo en local: `prisma migrate dev` usa una base temporal para comparar.
    await cliente.query(`CREATE ROLE ${admin} LOGIN PASSWORD 'pm_admin_dev' CREATEDB`);
  }
  // Bases locales creadas antes del 2026-10-24 tenían BYPASSRLS: se quita para que local se
  // comporte como el servidor.
  await cliente.query(`ALTER ROLE ${admin} NOBYPASSRLS`);
  if (!(await existe('SELECT 1 FROM pg_roles WHERE rolname = $1', [app]))) {
    await cliente.query(`CREATE ROLE ${app} LOGIN PASSWORD 'pm_app_dev' NOBYPASSRLS`);
  }
  if (!(await existe('SELECT 1 FROM pg_database WHERE datname = $1', [base]))) {
    await cliente.query(`CREATE DATABASE ${base} OWNER ${admin}`);
  }
  await cliente.end();

  return {
    detener: () => pg.stop(),
    urlApp: `postgresql://${app}:pm_app_dev@localhost:${puerto}/${base}`,
    urlAdmin: `postgresql://${admin}:pm_admin_dev@localhost:${puerto}/${base}`,
  };
}
