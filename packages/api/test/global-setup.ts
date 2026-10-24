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
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-test-pg-'));
  const pg = await levantarPostgres({
    dataDir,
    puerto: await puertoLibre(),
    base: 'lucuma_pm_test',
    persistente: false,
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
