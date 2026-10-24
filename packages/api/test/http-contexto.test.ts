/**
 * Contexto por petición, de punta a punta por HTTP: cuenta (por parámetro o subdominio),
 * sesión y membresía. Usa `app.inject`, sin abrir puertos.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { COOKIE_SESION, crearSesion, hashToken } from '../src/lib/sesion.js';
import { sembrarCuenta, unirACuenta, type Semilla } from './semilla.js';

let app: FastifyInstance;
let appSubdominio: FastifyInstance;
let A: Semilla;
let B: Semilla;
let cookieA: string; // dueño de A
let cookieAmbas: string; // equipo en A, cliente en B

const conCookie = (token: string) => ({ cookie: `${COOKIE_SESION}=${token}` });

beforeAll(async () => {
  [A, B] = await Promise.all([sembrarCuenta('A'), sembrarCuenta('B')]);
  await unirACuenta(A.memberId, B.accountId, 'client');
  cookieA = (await crearSesion(A.ownerId)).token;
  cookieAmbas = (await crearSesion(A.memberId)).token;
  app = await buildApp({ logger: false, baseDomain: '' });
  appSubdominio = await buildApp({ logger: false, baseDomain: 'pm.test' });
});

afterAll(async () => {
  await Promise.all([app.close(), appSubdominio.close()]);
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('GET /api/v1/yo (cuenta por ?cuenta=)', () => {
  it('miembro de la cuenta: 200 con su rol', async () => {
    const r = await app.inject({ url: `/api/v1/yo?cuenta=${A.slug}`, headers: conCookie(cookieA) });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ cuenta: { id: A.accountId, slug: A.slug }, rol: 'owner', usuario: { id: A.ownerId } });
  });

  it('el rol cambia según la cuenta', async () => {
    const enA = await app.inject({ url: `/api/v1/yo?cuenta=${A.slug}`, headers: conCookie(cookieAmbas) });
    const enB = await app.inject({ url: '/api/v1/yo', headers: { ...conCookie(cookieAmbas), 'x-cuenta': B.slug } });
    expect(enA.json().rol).toBe('member');
    expect(enB.json().rol).toBe('client');
  });

  it('sesión válida pero no es miembro de esa cuenta: 403', async () => {
    const r = await app.inject({ url: `/api/v1/yo?cuenta=${B.slug}`, headers: conCookie(cookieA) });
    expect(r.statusCode).toBe(403);
  });

  it('sin sesión: 401', async () => {
    const r = await app.inject({ url: `/api/v1/yo?cuenta=${A.slug}` });
    expect(r.statusCode).toBe(401);
  });

  it('token inventado: 401', async () => {
    const r = await app.inject({ url: `/api/v1/yo?cuenta=${A.slug}`, headers: conCookie('inventado') });
    expect(r.statusCode).toBe(401);
  });

  it('sesión vencida: 401', async () => {
    const token = 'vencido-' + A.slug;
    await prismaAdmin.session.create({
      data: { userId: A.ownerId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() - 1000) },
    });
    const r = await app.inject({ url: `/api/v1/yo?cuenta=${A.slug}`, headers: conCookie(token) });
    expect(r.statusCode).toBe(401);
  });

  it('cuenta que no existe: 404', async () => {
    const r = await app.inject({ url: '/api/v1/yo?cuenta=no-existe-nunca', headers: conCookie(cookieA) });
    expect(r.statusCode).toBe(404);
  });

  it('sin cuenta: 400', async () => {
    const r = await app.inject({ url: '/api/v1/yo', headers: conCookie(cookieA) });
    expect(r.statusCode).toBe(400);
  });

  it('membresía desactivada: 403', async () => {
    const C = await sembrarCuenta('C');
    const token = (await crearSesion(C.memberId)).token;
    await prismaAdmin.membership.update({
      where: { accountId_userId: { accountId: C.accountId, userId: C.memberId } },
      data: { status: 'disabled' },
    });
    const r = await app.inject({ url: `/api/v1/yo?cuenta=${C.slug}`, headers: conCookie(token) });
    expect(r.statusCode).toBe(403);
  });

  it('cuenta cerrada: 410', async () => {
    const C = await sembrarCuenta('C');
    const token = (await crearSesion(C.ownerId)).token;
    await prismaAdmin.account.update({ where: { id: C.accountId }, data: { closedAt: new Date() } });
    const r = await app.inject({ url: `/api/v1/yo?cuenta=${C.slug}`, headers: conCookie(token) });
    expect(r.statusCode).toBe(410);
  });
});

describe('GET /api/v1/yo (cuenta por subdominio)', () => {
  it('a.pm.test resuelve la cuenta del subdominio', async () => {
    const r = await appSubdominio.inject({ url: '/api/v1/yo', headers: { ...conCookie(cookieA), host: `${A.slug}.pm.test` } });
    expect(r.statusCode).toBe(200);
    expect(r.json().cuenta.id).toBe(A.accountId);
  });

  it('con subdominio, ?cuenta= y X-Cuenta se ignoran (no se puede saltar de cuenta)', async () => {
    const r = await appSubdominio.inject({
      url: `/api/v1/yo?cuenta=${B.slug}`,
      headers: { ...conCookie(cookieAmbas), host: `${A.slug}.pm.test`, 'x-cuenta': B.slug },
    });
    expect(r.json()).toMatchObject({ cuenta: { id: A.accountId }, rol: 'member' });
  });

  it('dominio raíz o ajeno: sin cuenta (400)', async () => {
    for (const host of ['pm.test', 'www.pm.test', 'otro.com', `x.${A.slug}.pm.test`]) {
      const r = await appSubdominio.inject({ url: '/api/v1/yo', headers: { ...conCookie(cookieA), host } });
      expect({ host, status: r.statusCode }).toEqual({ host, status: 400 });
    }
  });
});

describe('GET /api/v1/mis-cuentas', () => {
  it('lista todas las cuentas de la persona con su rol', async () => {
    const r = await app.inject({ url: '/api/v1/mis-cuentas', headers: conCookie(cookieAmbas) });
    expect(r.statusCode).toBe(200);
    const cuentas = r.json().cuentas as { slug: string; role: string }[];
    expect(new Map(cuentas.map((c) => [c.slug, c.role]))).toEqual(
      new Map([
        [A.slug, 'member'],
        [B.slug, 'client'],
      ])
    );
  });

  it('sin sesión: 401', async () => {
    const r = await app.inject({ url: '/api/v1/mis-cuentas' });
    expect(r.statusCode).toBe(401);
  });
});
