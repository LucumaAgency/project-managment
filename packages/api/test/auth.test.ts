/** Login: enlace mágico, contraseña, sesión, salir y cambio de contraseña. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { buzonDePrueba } from '../src/lib/correo.js';
import { hashPassword } from '../src/lib/password.js';
import { COOKIE_SESION, hashToken } from '../src/lib/sesion.js';
import { sembrarCuenta, sufijo, unirACuenta, type Semilla } from './semilla.js';

let app: FastifyInstance;
let appSubdominio: FastifyInstance;
let A: Semilla;
let B: Semilla;
let correoOwnerA: string;
const CLAVE = 'una-clave-larga-2026';

const json = (cuerpo: object) => ({ 'content-type': 'application/json', payload: JSON.stringify(cuerpo) });
const cookieDe = (r: LightMyRequestResponse) => r.cookies.find((c) => c.name === COOKIE_SESION);
const conCookie = (valor: string) => ({ cookie: `${COOKIE_SESION}=${valor}` });

function tokenDelUltimoCorreo(para: string): string {
  const c = [...buzonDePrueba].reverse().find((m) => m.to === para);
  const m = c?.html.match(/token=([A-Za-z0-9_-]+)/);
  if (!m) throw new Error(`No hay enlace en el buzón para ${para}`);
  return m[1];
}

async function entrarConClave(email: string, password = CLAVE, aplicacion = app) {
  const { payload } = json({ email, password });
  return aplicacion.inject({ method: 'POST', url: '/api/v1/auth/entrar', headers: { 'content-type': 'application/json' }, payload });
}

beforeAll(async () => {
  [A, B] = await Promise.all([sembrarCuenta('A'), sembrarCuenta('B')]);
  await unirACuenta(A.ownerId, B.accountId, 'member');
  const owner = await prismaAdmin.user.update({ where: { id: A.ownerId }, data: { passwordHash: await hashPassword(CLAVE) } });
  correoOwnerA = owner.email;
  app = await buildApp({ logger: false, baseDomain: '' });
  appSubdominio = await buildApp({ logger: false, baseDomain: 'pm.test' });
});

afterAll(async () => {
  await Promise.all([app.close(), appSubdominio.close()]);
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

beforeEach(() => {
  buzonDePrueba.length = 0;
});

describe('enlace mágico', () => {
  it('correo existente: llega un enlace que abre sesión una sola vez', async () => {
    const pedir = await app.inject({ method: 'POST', url: `/api/v1/auth/enlace?cuenta=${A.slug}`, headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ email: correoOwnerA.toUpperCase() }) });
    expect(pedir.statusCode).toBe(200);
    expect(buzonDePrueba).toHaveLength(1);
    // Local: el enlace usa APP_URL y conserva la cuenta desde la que se pidió.
    expect(buzonDePrueba[0].html).toMatch(new RegExp(`/entrar/enlace\\?token=[^&"]+&amp;cuenta=${A.slug}|/entrar/enlace\\?token=[^&"]+&cuenta=${A.slug}`));

    const token = tokenDelUltimoCorreo(correoOwnerA);
    const canje = await app.inject({ method: 'POST', url: '/api/v1/auth/canjear', ...json({ token }), headers: { 'content-type': 'application/json' } });
    expect(canje.statusCode).toBe(200);
    expect(canje.json().usuario.email).toBe(correoOwnerA);
    expect(canje.json().cuentas.map((c: { slug: string }) => c.slug).sort()).toEqual([A.slug, B.slug].sort());
    const cookie = cookieDe(canje)!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });

    const yo = await app.inject({ url: `/api/v1/yo?cuenta=${A.slug}`, headers: conCookie(cookie.value) });
    expect(yo.json().rol).toBe('owner');

    const otraVez = await app.inject({ method: 'POST', url: '/api/v1/auth/canjear', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ token }) });
    expect(otraVez.statusCode).toBe(401);
  });

  it('correo inexistente: misma respuesta y ningún correo', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/auth/enlace', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ email: `nadie-${sufijo()}@test.pe` }) });
    expect(r.statusCode).toBe(200);
    expect(r.json().mensaje).toMatch(/Si el correo tiene acceso/);
    expect(buzonDePrueba).toHaveLength(0);
  });

  it('enlace vencido: 401', async () => {
    const token = 'vencido-' + sufijo().repeat(4);
    await prismaAdmin.loginToken.create({ data: { userId: A.memberId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() - 1000) } });
    const r = await app.inject({ method: 'POST', url: '/api/v1/auth/canjear', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ token }) });
    expect(r.statusCode).toBe(401);
  });

  it('con subdominio, el enlace apunta al subdominio configurado aunque el Host sea otro', async () => {
    const correoB = (await prismaAdmin.user.findUniqueOrThrow({ where: { id: B.memberId } })).email;
    await appSubdominio.inject({ method: 'POST', url: '/api/v1/auth/enlace', headers: { 'content-type': 'application/json', host: `${B.slug}.pm.test` }, payload: JSON.stringify({ email: correoB }) });
    expect(buzonDePrueba.at(-1)!.html).toContain(`https://${B.slug}.pm.test/entrar/enlace?token=`);

    buzonDePrueba.length = 0;
    await appSubdominio.inject({ method: 'POST', url: '/api/v1/auth/enlace', headers: { 'content-type': 'application/json', host: 'atacante.com' }, payload: JSON.stringify({ email: correoB }) });
    const html = buzonDePrueba.at(-1)?.html ?? '';
    expect(html).toContain('https://pm.test/entrar/enlace?token=');
    expect(html).not.toContain('atacante');
  });

  it('frena el abuso: más de 3 pedidos por correo en 15 minutos no mandan más correos', async () => {
    const correoC = (await prismaAdmin.user.findUniqueOrThrow({ where: { id: B.clientId } })).email;
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: 'POST', url: '/api/v1/auth/enlace', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ email: correoC }) });
    }
    expect(buzonDePrueba.filter((c) => c.to === correoC)).toHaveLength(3);
  });
});

describe('contraseña', () => {
  it('correcta: abre sesión', async () => {
    const r = await entrarConClave(correoOwnerA);
    expect(r.statusCode).toBe(200);
    expect(cookieDe(r)?.value).toBeTruthy();
    const login = await prismaAdmin.auditLog.findFirst({ where: { userId: A.ownerId, action: 'user.login' }, orderBy: { createdAt: 'desc' } });
    expect(login).toMatchObject({ accountId: null, meta: { metodo: 'password' } });
  });

  it('incorrecta, correo inexistente o sin contraseña: mismo 401', async () => {
    const correoSinClave = (await prismaAdmin.user.findUniqueOrThrow({ where: { id: A.clientId } })).email;
    const respuestas = await Promise.all([
      entrarConClave(correoOwnerA, 'otra-clave-cualquiera'),
      entrarConClave(`nadie-${sufijo()}@test.pe`),
      entrarConClave(correoSinClave),
    ]);
    for (const r of respuestas) expect({ status: r.statusCode, error: r.json().error }).toEqual({ status: 401, error: 'Correo o contraseña incorrectos.' });
  });

  it('5 fallos seguidos bloquean 15 minutos (429), aunque luego acierte', async () => {
    const C = await sembrarCuenta('C');
    const correoC = (await prismaAdmin.user.update({ where: { id: C.ownerId }, data: { passwordHash: await hashPassword(CLAVE) } })).email;
    for (let i = 0; i < 5; i++) expect((await entrarConClave(correoC, 'mal-mal-mal')).statusCode).toBe(401);
    expect((await entrarConClave(correoC)).statusCode).toBe(429);
  });
});

describe('sesión', () => {
  it('GET /auth/sesion: datos y cuentas; sin sesión 401', async () => {
    const cookie = cookieDe(await entrarConClave(correoOwnerA))!.value;
    const r = await app.inject({ url: '/api/v1/auth/sesion', headers: conCookie(cookie) });
    expect(r.json()).toMatchObject({ usuario: { id: A.ownerId, tienePassword: true } });
    expect((await app.inject({ url: '/api/v1/auth/sesion' })).statusCode).toBe(401);
  });

  it('salir borra la sesión: la misma cookie deja de servir', async () => {
    const cookie = cookieDe(await entrarConClave(correoOwnerA))!.value;
    const salir = await app.inject({ method: 'POST', url: '/api/v1/auth/salir', headers: conCookie(cookie) });
    expect(salir.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/v1/auth/sesion', headers: conCookie(cookie) })).statusCode).toBe(401);
  });

  it('con dominio base la cookie sirve para todos los subdominios', async () => {
    const r = await entrarConClave(correoOwnerA, CLAVE, appSubdominio);
    expect(cookieDe(r)?.domain).toBe('.pm.test');
  });
});

describe('sesión que se renueva con el uso', () => {
  const DIA = 86_400_000;
  async function sesionQueVence(enDias: number) {
    const token = `renovable-${sufijo()}${sufijo()}`;
    const fila = await prismaAdmin.session.create({
      data: { userId: A.ownerId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + enDias * DIA) },
    });
    return { token, id: fila.id };
  }

  it('si se usa, vuelve a durar 30 días y la cookie se repone', async () => {
    const { token, id } = await sesionQueVence(3);
    const r = await app.inject({ url: '/api/v1/auth/sesion', headers: conCookie(token) });
    expect(r.statusCode).toBe(200);
    const vence = (await prismaAdmin.session.findUniqueOrThrow({ where: { id } })).expiresAt.getTime();
    expect(vence).toBeGreaterThan(Date.now() + 29 * DIA);
    const cookie = cookieDe(r)!;
    expect(cookie.value).toBe(token);
    expect(new Date(cookie.expires!).getTime()).toBeGreaterThan(Date.now() + 29 * DIA);
  });

  it('recién renovada no vuelve a escribir (máximo una vez al día)', async () => {
    const { token } = await sesionQueVence(29.9);
    const r = await app.inject({ url: '/api/v1/auth/sesion', headers: conCookie(token) });
    expect(r.statusCode).toBe(200);
    expect(cookieDe(r)).toBeUndefined();
  });

  it('vencida no revive aunque se use', async () => {
    const { token } = await sesionQueVence(-0.01);
    expect((await app.inject({ url: '/api/v1/auth/sesion', headers: conCookie(token) })).statusCode).toBe(401);
  });
});

describe('cambiar contraseña', () => {
  it('exige la actual, cierra las otras sesiones y deja viva esta', async () => {
    const D = await sembrarCuenta('D');
    const correoD = (await prismaAdmin.user.update({ where: { id: D.ownerId }, data: { passwordHash: await hashPassword(CLAVE) } })).email;
    const esta = cookieDe(await entrarConClave(correoD))!.value;
    const otra = cookieDe(await entrarConClave(correoD))!.value;

    const sinActual = await app.inject({ method: 'POST', url: '/api/v1/auth/password', headers: { ...conCookie(esta), 'content-type': 'application/json' }, payload: JSON.stringify({ nueva: 'clave-nueva-larga-2026' }) });
    expect(sinActual.statusCode).toBe(403);

    const corta = await app.inject({ method: 'POST', url: '/api/v1/auth/password', headers: { ...conCookie(esta), 'content-type': 'application/json' }, payload: JSON.stringify({ actual: CLAVE, nueva: 'corta' }) });
    expect(corta.statusCode).toBe(400);

    const ok = await app.inject({ method: 'POST', url: '/api/v1/auth/password', headers: { ...conCookie(esta), 'content-type': 'application/json' }, payload: JSON.stringify({ actual: CLAVE, nueva: 'clave-nueva-larga-2026' }) });
    expect(ok.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/v1/auth/sesion', headers: conCookie(esta) })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/v1/auth/sesion', headers: conCookie(otra) })).statusCode).toBe(401);
    expect((await entrarConClave(correoD, 'clave-nueva-larga-2026')).statusCode).toBe(200);
  });

  it('quien no tiene contraseña la define sin pedir la actual', async () => {
    const E = await sembrarCuenta('E');
    const correoE = (await prismaAdmin.user.findUniqueOrThrow({ where: { id: E.memberId } })).email;
    await app.inject({ method: 'POST', url: '/api/v1/auth/enlace', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ email: correoE }) });
    const canje = await app.inject({ method: 'POST', url: '/api/v1/auth/canjear', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ token: tokenDelUltimoCorreo(correoE) }) });
    const cookie = cookieDe(canje)!.value;
    const r = await app.inject({ method: 'POST', url: '/api/v1/auth/password', headers: { ...conCookie(cookie), 'content-type': 'application/json' }, payload: JSON.stringify({ nueva: 'primera-clave-2026' }) });
    expect(r.statusCode).toBe(200);
  });
});

describe('solo JSON', () => {
  it('un POST con text/plain (formulario de otro sitio) se rechaza', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/auth/entrar', headers: { 'content-type': 'text/plain' }, payload: JSON.stringify({ email: correoOwnerA, password: CLAVE }) });
    expect(r.statusCode).toBe(415);
  });
});
