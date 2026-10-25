/**
 * Día 15: respaldo de la base. Lo puro corre siempre; el respaldo y la restauración de verdad,
 * solo si hay un pg_dump igual o más nuevo que el Postgres de los tests (TEST_PG_BIN_DIR o el
 * del sistema). Se restaura en una base APARTE: nunca sobre la de los tests.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma, prismaAdmin } from '../src/db.js';
import { env } from '../src/env.js';
import { buscarHerramienta, conexionPg, elegir, hacerRespaldo, listarRespaldos, restaurarEn, rotar, versionServidor } from '../src/services/respaldo.js';
import { sembrarCuenta, type Semilla } from './semilla.js';

let A: Semilla;
let hayPgDump = false;
const base = `respaldo_prueba_${process.pid}`;

beforeAll(async () => {
  A = await sembrarCuenta('A');
  const servidor = await versionServidor();
  const h = await buscarHerramienta('pg_dump', servidor);
  // Misma versión que la base: un pg_restore más nuevo puede escribir ajustes que una base vieja
  // no conoce (17 → transaction_timeout en una 16; el CI solo trae 17).
  hayPgDump = !!h && h.version === servidor;
  if (!hayPgDump) console.warn(`respaldo.test: sin pg_dump ${servidor} (${h ? `hay ${h.version}` : 'no hay'}); se salta el respaldo real.`);
});

afterAll(async () => {
  await prismaAdmin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${base}`).catch(() => {});
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
  fs.rmSync(env.respaldosDir, { recursive: true, force: true });
});

describe('piezas', () => {
  it('la conexión para pg_dump no lleva la clave ni parámetros de Prisma', () => {
    const c = conexionPg('postgresql://carlosm_pm_admin:cl%40ve%2Fx@localhost:5432/carlosm_lucuma_pm?schema=public&sslmode=require');
    expect(c.password).toBe('cl@ve/x');
    expect(c.dbname).toBe('postgresql://carlosm_pm_admin@localhost:5432/carlosm_lucuma_pm?sslmode=require');
  });

  it('elige la herramienta más cercana a la base, no la más nueva', () => {
    const hay = [{ version: 14 }, { version: 17 }, { version: 16 }, { version: 12 }];
    expect(elegir(hay, 16)).toEqual({ version: 16 });
    expect(elegir(hay, 12)).toEqual({ version: 12 });
    expect(elegir(hay, 13)).toEqual({ version: 14 });
    expect(elegir([{ version: 11 }, { version: 10 }], 12)).toEqual({ version: 11 }); // no alcanza: la más nueva
    expect(elegir([], 12)).toBeNull();
  });

  it('rota: deja los N más nuevos con su lista de archivos', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-rotar-'));
    for (const d of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']) {
      fs.writeFileSync(path.join(dir, `base-${d}.dump`), 'x');
      fs.writeFileSync(path.join(dir, `archivos-${d}.tsv`), 'x');
    }
    fs.writeFileSync(path.join(dir, 'antes-de-restaurar-2026-09-01.dump'), 'x');
    await rotar(dir, 2);
    expect(fs.readdirSync(dir).sort()).toEqual([
      'antes-de-restaurar-2026-09-01.dump',
      'archivos-2026-10-03.tsv',
      'archivos-2026-10-04.tsv',
      'base-2026-10-03.dump',
      'base-2026-10-04.dump',
    ]);
    expect((await listarRespaldos(dir)).map((x) => x.dia)).toEqual(['2026-10-04', '2026-10-03']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('sin pg_dump, el motivo es claro', async (ctx) => {
    if (env.pgBinDir || (await buscarHerramienta('pg_dump'))) return ctx.skip(); // hay alguno: no se puede esconder
    await expect(hacerRespaldo({ dia: '2026-01-01' })).rejects.toThrow(/pg_dump/);
  });
});

describe('respaldo y restauración de verdad', () => {
  it('respalda, y restaurado en otra base trae los mismos datos', async (ctx) => {
    if (!hayPgDump) return ctx.skip();
    // Otros tests crean cuentas en paralelo: se cuenta antes y después del respaldo.
    const antes = await prismaAdmin.account.count();
    const r = await hacerRespaldo({ dia: '2026-10-24' });
    const despues = await prismaAdmin.account.count();
    expect(fs.statSync(r.archivo).size).toBeGreaterThan(1000);
    expect((fs.statSync(r.archivo).mode & 0o777) !== 0o666).toBe(true);
    const lista = fs.readFileSync(path.join(env.respaldosDir, 'archivos-2026-10-24.tsv'), 'utf8');
    expect(lista.split('\n')[0]).toBe('cuenta\tclave\tbytes\tsha256');

    await prismaAdmin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${base}`);
    await prismaAdmin.$executeRawUnsafe(`CREATE DATABASE ${base}`);
    const url = new URL(env.databaseAdminUrl);
    url.pathname = `/${base}`;
    await restaurarEn(r.archivo, url.toString());

    const copia = new PrismaClient({ datasourceUrl: url.toString() });
    try {
      const cuentas = await copia.account.count();
      expect(cuentas).toBeGreaterThanOrEqual(antes);
      expect(cuentas).toBeLessThanOrEqual(despues);
      expect(await copia.account.findUnique({ where: { id: A.accountId }, select: { slug: true } })).toEqual({ slug: A.slug });
      // Con RLS, funciones de búsqueda y migraciones incluidas.
      const [{ rls }] = await copia.$queryRaw<{ rls: boolean }[]>`SELECT relrowsecurity AS rls FROM pg_class WHERE relname = 'recordings'`;
      expect(rls).toBe(true);
      const [{ t }] = await copia.$queryRaw<{ t: string }[]>`SELECT pm_sin_tildes('Diseño') AS t`;
      expect(t).toBe('diseno');
      expect(await copia.$queryRaw<unknown[]>`SELECT 1 FROM _prisma_migrations`).not.toHaveLength(0);
    } finally {
      await copia.$disconnect();
    }
  });
});
