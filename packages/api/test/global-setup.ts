import { execSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import { levantarPostgres } from '../../../scripts/pg-embebido.mjs';

declare module 'vitest' {
  export interface ProvidedContext {
    urlApp: string;
    urlAdmin: string;
  }
}

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function puertoLibre(): Promise<number> {
  return new Promise((ok, mal) => {
    const s = net.createServer();
    s.unref();
    s.on('error', mal);
    s.listen(0, () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => ok(port));
    });
  });
}

/**
 * Postgres propio de la corrida: carpeta temporal y puerto libre, así no toca la base de
 * desarrollo y corre igual en CI. Se aplican las MISMAS migraciones que en producción.
 */
export default async function setup(project: TestProject) {
  // embedded-postgres registra async-exit-hook, que al final llama process.exit(0) y pisa el
  // código de fallo de vitest: con tests fallando, `npm test` salía con 0 y el CI quedaba verde
  // (descubierto el 2026-10-24, día 15). Se respeta el código que vitest dejó en exitCode.
  const salir = process.exit.bind(process);
  process.exit = ((codigo?: number) => salir(codigo || (process.exitCode as number | undefined) || 0)) as typeof process.exit;

  // Contra otro Postgres (p. ej. la versión del servidor): TEST_PG_URL_APP y TEST_PG_URL_ADMIN.
  // La base tiene que estar vacía; se le aplican las migraciones y queda con datos de prueba.
  const externa = { app: process.env.TEST_PG_URL_APP, admin: process.env.TEST_PG_URL_ADMIN };
  if (externa.app && externa.admin) {
    execSync('npx prisma migrate deploy', {
      cwd: raiz,
      env: { ...process.env, DATABASE_URL: externa.app, DATABASE_ADMIN_URL: externa.admin },
      stdio: 'pipe',
    });
    project.provide('urlApp', externa.app);
    project.provide('urlAdmin', externa.admin);
    return;
  }

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-test-pg-'));
  const pg = await levantarPostgres({
    dataDir,
    puerto: await puertoLibre(),
    base: 'lucuma_pm_test',
    persistente: false,
    // Roles con prefijo, como los crea Plesk (carlosm_pm_admin): así cada corrida prueba que
    // las migraciones no dependen del nombre exacto (D-45).
    prefijo: 'plesk_',
  });

  execSync('npx prisma migrate deploy', {
    cwd: raiz,
    env: { ...process.env, DATABASE_URL: pg.urlApp, DATABASE_ADMIN_URL: pg.urlAdmin },
    stdio: 'pipe',
  });

  project.provide('urlApp', pg.urlApp);
  project.provide('urlAdmin', pg.urlAdmin);

  return async () => {
    await pg.detener();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
}
