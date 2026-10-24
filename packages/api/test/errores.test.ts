/** El manejador de errores: lo previsto sale con su código; lo imprevisto, genérico. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { HttpError } from '../src/lib/errores.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp({ logger: false, baseDomain: '' });
  app.get('/api/v1/prueba/503', async () => {
    throw new HttpError(503, 'El acceso por correo todavía no está disponible.');
  });
  app.get('/api/v1/prueba/rota', async () => {
    throw new Error('detalle interno de la base: tabla recordings');
  });
});
afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('errores', () => {
  it('un HttpError sale con su código y su mensaje, aunque sea 503', async () => {
    const r = await app.inject({ url: '/api/v1/prueba/503' });
    expect({ status: r.statusCode, body: r.json() }).toEqual({ status: 503, body: { error: 'El acceso por correo todavía no está disponible.' } });
  });

  it('un error imprevisto sale como 500 genérico, sin detalles internos', async () => {
    const r = await app.inject({ url: '/api/v1/prueba/rota' });
    expect({ status: r.statusCode, body: r.json() }).toEqual({ status: 500, body: { error: 'Error interno.' } });
  });

  it('una ruta de la API que no existe da 404 en JSON', async () => {
    const r = await app.inject({ url: '/api/v1/no-existe' });
    expect(r.statusCode).toBe(404);
  });
});
