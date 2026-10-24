/** Día 15: errores a Sentry (sin SDK). Un servidor falso hace de Sentry. */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { env } from '../src/env.js';
import { crearSesion } from '../src/lib/sesion.js';
import { leerDsn, marcos, olvidarReportes, reportar } from '../src/lib/sentry.js';
import { cliente } from './http.js';
import { sembrarCuenta, type Semilla } from './semilla.js';

let servidor: http.Server;
let dsn: string;
let recibidos: { url: string; auth: string; cuerpo: string }[] = [];
let app: FastifyInstance;
let A: Semilla;

const esperar = async (n: number) => {
  for (let i = 0; i < 50 && recibidos.length < n; i++) await new Promise((r) => setTimeout(r, 20));
};
const eventoDe = (cuerpo: string) => JSON.parse(cuerpo.split('\n')[2]);

beforeAll(async () => {
  servidor = http.createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (d) => (cuerpo += d));
    req.on('end', () => {
      recibidos.push({ url: req.url ?? '', auth: String(req.headers['x-sentry-auth']), cuerpo });
      res.end('{}');
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  dsn = `http://clavepublica@127.0.0.1:${(servidor.address() as AddressInfo).port}/42`;
  A = await sembrarCuenta('A');
  app = await buildApp({ logger: false, baseDomain: '' });
  // Una ruta que falla de verdad, para probar el manejador de errores.
  app.get('/api/v1/_falla', async () => {
    throw new Error('se rompió algo');
  });
});

beforeEach(() => {
  recibidos = [];
  olvidarReportes();
  env.sentryDsn = dsn;
});

afterAll(async () => {
  env.sentryDsn = '';
  await app.close();
  servidor.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('piezas', () => {
  it('lee el DSN', () => {
    expect(leerDsn('https://abc@o12.ingest.us.sentry.io/4507')).toEqual({ url: 'https://o12.ingest.us.sentry.io/api/4507/envelope/', clave: 'abc' });
    expect(leerDsn('https://abc@sentry.mio.pe/sub/7')).toEqual({ url: 'https://sentry.mio.pe/sub/api/7/envelope/', clave: 'abc' });
    expect(leerDsn('no es un dsn')).toBeNull();
    expect(leerDsn('https://o12.ingest.sentry.io/1')).toBeNull();
  });

  it('pila de V8 a marcos, del más viejo al más nuevo', () => {
    const f = marcos('Error: x\n    at uno (file:///app/dist/a.js:10:5)\n    at /app/node_modules/fastify/b.js:2:3\n    at node:internal/c:1:1');
    expect(f.map((m) => m.lineno)).toEqual([1, 2, 10]);
    expect(f[2]).toMatchObject({ function: 'uno', filename: '/app/dist/a.js', in_app: true });
    expect(f[1].in_app).toBe(false);
  });

  it('sin DSN no manda nada; el mismo error, una vez por minuto', async () => {
    expect(await reportar(new Error('a'), {}, '')).toBe(false);
    expect(await reportar(new Error('b'))).toBe(true);
    expect(await reportar(new Error('b'))).toBe(false);
    await esperar(1);
    expect(recibidos).toHaveLength(1);
    expect(recibidos[0].url).toBe('/api/42/envelope/');
    expect(recibidos[0].auth).toContain('sentry_key=clavepublica');
  });

  it('un Sentry caído no rompe nada', async () => {
    expect(await reportar(new Error('c'), {}, 'http://k@127.0.0.1:1/1')).toBe(false);
  });
});

describe('desde la app', () => {
  it('un 500 llega con la ruta, la cuenta y la persona; sin la query ni datos de la persona', async () => {
    const c = cliente(app, (await crearSesion(A.ownerId)).token, A.slug);
    const r = await c.get('/_falla?token=supersecreto');
    expect(r.status).toBe(500);
    expect(r.json.error).toBe('Error interno.');
    await esperar(1);
    const ev = eventoDe(recibidos[0].cuerpo);
    expect(ev.exception.values[0]).toMatchObject({ type: 'Error', value: 'se rompió algo' });
    expect(ev.tags).toMatchObject({ ruta: '/api/v1/_falla', metodo: 'GET', status: '500' });
    expect(ev.user).toEqual({ id: A.ownerId });
    expect(recibidos[0].cuerpo).not.toContain('supersecreto');
    expect(recibidos[0].cuerpo).not.toContain('@test');
  });

  it('los errores previstos (404, 403, 400) no se reportan', async () => {
    const c = cliente(app, (await crearSesion(A.clientId)).token, A.slug);
    await c.get('/proyectos/no-existe');
    await c.get('/cuenta/exportar');
    await new Promise((r) => setTimeout(r, 100));
    expect(recibidos).toHaveLength(0);
  });

  it('/config entrega el DSN de la web solo si está configurado', async () => {
    expect((await app.inject({ url: '/api/v1/config' })).json().sentry).toBeNull();
  });
});
