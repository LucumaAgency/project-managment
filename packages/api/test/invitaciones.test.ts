/** Invitaciones por enlace (sin correo), gestión de personas, límites del plan y soporte en beta. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { COOKIE_SESION, crearSesion, hashToken } from '../src/lib/sesion.js';
import { sembrarCuenta, sufijo, type Semilla } from './semilla.js';

let app: FastifyInstance;
let appSinSoporte: FastifyInstance;
let A: Semilla;
let B: Semilla;
let owner: string; // cookies
let member: string;
let client: string;
const CLAVE = 'clave-de-prueba-2026';

const cookieDe = (r: LightMyRequestResponse) => r.cookies.find((c) => c.name === COOKIE_SESION)?.value;

function pedir(
  metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  opciones: { cookie?: string; cuenta?: string; body?: object; aplicacion?: FastifyInstance } = {}
) {
  const headers: Record<string, string> = {};
  if (opciones.cookie) headers.cookie = `${COOKIE_SESION}=${opciones.cookie}`;
  if (opciones.cuenta) headers['x-cuenta'] = opciones.cuenta;
  if (opciones.body) headers['content-type'] = 'application/json';
  return (opciones.aplicacion ?? app).inject({
    method: metodo,
    url,
    headers,
    payload: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
}

const tokenDe = (enlace: string) => new URL(enlace).searchParams.get('token')!;

async function invitar(cookie: string, cuenta: string, body: object) {
  return pedir('POST', '/api/v1/invitaciones', { cookie, cuenta, body });
}

beforeAll(async () => {
  [A, B] = await Promise.all([sembrarCuenta('A'), sembrarCuenta('B')]);
  [owner, member, client] = await Promise.all(
    [A.ownerId, A.memberId, A.clientId].map(async (id) => (await crearSesion(id)).token)
  );
  app = await buildApp({ logger: false, baseDomain: '', soporteBeta: true });
  appSinSoporte = await buildApp({ logger: false, baseDomain: '', soporteBeta: false });
});

afterAll(async () => {
  await Promise.all([app.close(), appSinSoporte.close()]);
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('crear invitación', () => {
  it('owner invita al equipo: devuelve un enlace a la cuenta con token, y queda en el registro', async () => {
    const email = `nueva-${sufijo()}@test.pe`;
    const r = await invitar(owner, A.slug, { email: email.toUpperCase(), role: 'member' });
    expect(r.statusCode).toBe(200);
    const { invitacion, enlace } = r.json();
    expect(invitacion).toMatchObject({ email, role: 'member' });
    expect(enlace).toMatch(new RegExp(`/invitacion\\?token=[A-Za-z0-9_-]{40,}&cuenta=${A.slug}$`));
    const fila = await prismaAdmin.invitation.findUniqueOrThrow({ where: { id: invitacion.id } });
    expect(fila.tokenHash).not.toContain(tokenDe(enlace)); // solo el hash en la base
    expect(await prismaAdmin.auditLog.count({ where: { accountId: A.accountId, action: 'invitacion.crear' } })).toBeGreaterThan(0);
  });

  it('el equipo no invita equipo; el cliente no invita a nadie', async () => {
    expect((await invitar(member, A.slug, { email: `x-${sufijo()}@test.pe`, role: 'member' })).statusCode).toBe(403);
    expect((await invitar(client, A.slug, { email: `x-${sufijo()}@test.pe`, role: 'client' })).statusCode).toBe(403);
  });

  it('el equipo invita clientes solo a proyectos donde está', async () => {
    const sinProyecto = await invitar(member, A.slug, { email: `c-${sufijo()}@test.pe`, role: 'client' });
    expect(sinProyecto.statusCode).toBe(400);
    const conProyecto = await invitar(member, A.slug, { email: `c-${sufijo()}@test.pe`, role: 'client', projectId: A.projectId });
    expect(conProyecto.statusCode).toBe(200);

    const otro = await prismaAdmin.project.create({ data: { accountId: A.accountId, name: 'Ajeno', createdById: A.ownerId } });
    const ajeno = await invitar(member, A.slug, { email: `c-${sufijo()}@test.pe`, role: 'client', projectId: otro.id });
    expect(ajeno.statusCode).toBe(403);
  });

  it('no se puede invitar a un proyecto de otra cuenta', async () => {
    const r = await invitar(owner, A.slug, { email: `c-${sufijo()}@test.pe`, role: 'client', projectId: B.projectId });
    expect(r.statusCode).toBe(404);
  });

  it('no se invita como dueño ni a quien ya está', async () => {
    expect((await invitar(owner, A.slug, { email: `o-${sufijo()}@test.pe`, role: 'owner' })).statusCode).toBe(400);
    const yaEsta = (await prismaAdmin.user.findUniqueOrThrow({ where: { id: A.memberId } })).email;
    expect((await invitar(owner, A.slug, { email: yaEsta, role: 'member' })).statusCode).toBe(409);
  });

  it('invitar de nuevo al mismo correo reemplaza la anterior: el enlace viejo deja de servir', async () => {
    const email = `doble-${sufijo()}@test.pe`;
    const primero = (await invitar(owner, A.slug, { email, role: 'member' })).json().enlace;
    const segundo = (await invitar(owner, A.slug, { email, role: 'admin' })).json().enlace;
    expect((await pedir('POST', '/api/v1/invitacion/ver', { body: { token: tokenDe(primero) } })).statusCode).toBe(404);
    expect((await pedir('POST', '/api/v1/invitacion/ver', { body: { token: tokenDe(segundo) } })).json().role).toBe('admin');
    expect(await prismaAdmin.invitation.count({ where: { accountId: A.accountId, email } })).toBe(1);
  });
});

describe('aceptar invitación', () => {
  it('persona nueva: ve la invitación, crea su contraseña, entra y queda con el rol y el proyecto', async () => {
    const email = `cliente-${sufijo()}@test.pe`;
    const enlace = (await invitar(owner, A.slug, { email, role: 'client', projectId: A.projectId })).json().enlace;
    const token = tokenDe(enlace);

    const ver = await pedir('POST', '/api/v1/invitacion/ver', { body: { token } });
    expect(ver.json()).toMatchObject({
      estado: 'vigente',
      cuenta: { slug: A.slug },
      email,
      role: 'client',
      proyecto: 'Web A',
      invitadoPor: 'owner A',
      existeUsuario: false,
      sesion: null,
    });

    const sinDatos = await pedir('POST', '/api/v1/invitacion/aceptar', { body: { token } });
    expect(sinDatos.statusCode).toBe(400);
    const corta = await pedir('POST', '/api/v1/invitacion/aceptar', { body: { token, nombre: 'María', password: 'corta' } });
    expect(corta.statusCode).toBe(400);

    const r = await pedir('POST', '/api/v1/invitacion/aceptar', { body: { token, nombre: 'María', password: CLAVE } });
    expect(r.statusCode).toBe(200);
    expect(r.json().cuenta.slug).toBe(A.slug);
    const cookie = cookieDe(r)!;
    expect(cookie).toBeTruthy();

    const yo = await pedir('GET', '/api/v1/yo', { cookie, cuenta: A.slug });
    expect(yo.json()).toMatchObject({ rol: 'client', usuario: { name: 'María', email } });
    const user = await prismaAdmin.user.findUniqueOrThrow({ where: { email } });
    expect(await prismaAdmin.projectMember.count({ where: { projectId: A.projectId, userId: user.id } })).toBe(1);

    // Y la contraseña que eligió sirve para entrar.
    const login = await pedir('POST', '/api/v1/auth/entrar', { body: { email, password: CLAVE } });
    expect(login.statusCode).toBe(200);

    // El enlace sirve una vez.
    const otraVez = await pedir('POST', '/api/v1/invitacion/aceptar', { body: { token, nombre: 'Otra', password: CLAVE } });
    expect(otraVez.statusCode).toBe(410);
    expect((await pedir('POST', '/api/v1/invitacion/ver', { body: { token } })).json().estado).toBe('usada');
  });

  it('persona que ya existe: sin su sesión no puede aceptar (el enlace no da su identidad)', async () => {
    // El dueño de B es invitado a A.
    const emailB = (await prismaAdmin.user.findUniqueOrThrow({ where: { id: B.ownerId } })).email;
    const enlace = (await invitar(owner, A.slug, { email: emailB, role: 'admin' })).json().enlace;
    const token = tokenDe(enlace);

    expect((await pedir('POST', '/api/v1/invitacion/ver', { body: { token } })).json().existeUsuario).toBe(true);
    // Sin sesión, aunque mande nombre y contraseña nuevos: 401 y la contraseña no cambia.
    const antes = (await prismaAdmin.user.findUniqueOrThrow({ where: { id: B.ownerId } })).passwordHash;
    const sinSesion = await pedir('POST', '/api/v1/invitacion/aceptar', { body: { token, nombre: 'Intruso', password: CLAVE } });
    expect(sinSesion.statusCode).toBe(401);
    expect((await prismaAdmin.user.findUniqueOrThrow({ where: { id: B.ownerId } })).passwordHash).toBe(antes);
    // Con la sesión de otra persona: tampoco.
    expect((await pedir('POST', '/api/v1/invitacion/aceptar', { cookie: member, body: { token } })).statusCode).toBe(401);

    // Con su propia sesión: entra a A como admin y sigue siendo dueña de B.
    const suya = (await crearSesion(B.ownerId)).token;
    const ver = await pedir('POST', '/api/v1/invitacion/ver', { cookie: suya, body: { token } });
    expect(ver.json().sesion).toEqual({ email: emailB, esLaInvitada: true });
    const r = await pedir('POST', '/api/v1/invitacion/aceptar', { cookie: suya, body: { token } });
    expect(r.statusCode).toBe(200);
    expect(r.json().sesion).toBeNull(); // no abre otra sesión: ya tenía
    expect((await pedir('GET', '/api/v1/yo', { cookie: suya, cuenta: A.slug })).json().rol).toBe('admin');
    expect((await pedir('GET', '/api/v1/yo', { cookie: suya, cuenta: B.slug })).json().rol).toBe('owner');
  });

  it('a quien ya está en la cuenta no se le baja el rol al aceptar como cliente de un proyecto', async () => {
    const C = await sembrarCuenta('C');
    const emailMember = (await prismaAdmin.user.findUniqueOrThrow({ where: { id: C.memberId } })).email;
    const proyecto2 = await prismaAdmin.project.create({ data: { accountId: C.accountId, name: 'Otro', createdById: C.ownerId } });
    // Se arma a mano: la API no deja invitar a quien ya está activo.
    const { token } = await crearInvitacionManual(C, emailMember, 'client', proyecto2.id);

    const sesion = (await crearSesion(C.memberId)).token;
    expect((await pedir('POST', '/api/v1/invitacion/aceptar', { cookie: sesion, body: { token } })).statusCode).toBe(200);
    const m = await prismaAdmin.membership.findUniqueOrThrow({ where: { accountId_userId: { accountId: C.accountId, userId: C.memberId } } });
    expect(m.role).toBe('member');
    expect(await prismaAdmin.projectMember.count({ where: { projectId: proyecto2.id, userId: C.memberId } })).toBe(1);
  });

  it('vencida: 410; anulada: 404; renovada: el enlace nuevo sirve y el viejo no', async () => {
    const email = `v-${sufijo()}@test.pe`;
    const r = (await invitar(owner, A.slug, { email, role: 'member' })).json();
    await prismaAdmin.invitation.update({ where: { id: r.invitacion.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const vencida = await pedir('POST', '/api/v1/invitacion/aceptar', { body: { token: tokenDe(r.enlace), nombre: 'V', password: CLAVE } });
    expect(vencida.statusCode).toBe(410);
    expect(await prismaAdmin.user.count({ where: { email } })).toBe(0); // no quedó una persona a medias

    const renovada = await pedir('POST', `/api/v1/invitaciones/${r.invitacion.id}/renovar`, { cookie: owner, cuenta: A.slug });
    expect(renovada.statusCode).toBe(200);
    const nuevo = tokenDe(renovada.json().enlace);
    expect((await pedir('POST', '/api/v1/invitacion/ver', { body: { token: tokenDe(r.enlace) } })).statusCode).toBe(404);
    expect((await pedir('POST', '/api/v1/invitacion/ver', { body: { token: nuevo } })).json().estado).toBe('vigente');

    const anular = await pedir('DELETE', `/api/v1/invitaciones/${r.invitacion.id}`, { cookie: owner, cuenta: A.slug });
    expect(anular.statusCode).toBe(200);
    expect((await pedir('POST', '/api/v1/invitacion/ver', { body: { token: nuevo } })).statusCode).toBe(404);
  });

  it('el equipo solo renueva o anula sus propias invitaciones', async () => {
    const deOwner = (await invitar(owner, A.slug, { email: `p-${sufijo()}@test.pe`, role: 'client', projectId: A.projectId })).json();
    expect((await pedir('DELETE', `/api/v1/invitaciones/${deOwner.invitacion.id}`, { cookie: member, cuenta: A.slug })).statusCode).toBe(403);
    const suya = (await invitar(member, A.slug, { email: `p-${sufijo()}@test.pe`, role: 'client', projectId: A.projectId })).json();
    expect((await pedir('DELETE', `/api/v1/invitaciones/${suya.invitacion.id}`, { cookie: member, cuenta: A.slug })).statusCode).toBe(200);
  });

  it('desde otra cuenta no se puede renovar ni anular (RLS: 404)', async () => {
    const deA = (await invitar(owner, A.slug, { email: `q-${sufijo()}@test.pe`, role: 'member' })).json();
    const ownerB = (await crearSesion(B.ownerId)).token;
    expect((await pedir('DELETE', `/api/v1/invitaciones/${deA.invitacion.id}`, { cookie: ownerB, cuenta: B.slug })).statusCode).toBe(404);
    expect((await pedir('POST', `/api/v1/invitaciones/${deA.invitacion.id}/renovar`, { cookie: ownerB, cuenta: B.slug })).statusCode).toBe(404);
  });

  it('token inventado: 404', async () => {
    expect((await pedir('POST', '/api/v1/invitacion/ver', { body: { token: 'x'.repeat(43) } })).statusCode).toBe(404);
  });
});

describe('límite de usuarios del plan', () => {
  it('cuenta las invitaciones pendientes de equipo; los clientes no cuentan', async () => {
    // La semilla trae owner + member activos y 1 invitación de equipo pendiente: 3 en uso.
    const C = await sembrarCuenta('C');
    await prismaAdmin.account.update({ where: { id: C.accountId }, data: { limits: { maxUsuarios: 4 } } });
    const sesion = (await crearSesion(C.ownerId)).token;

    expect((await invitar(sesion, C.slug, { email: `e1-${sufijo()}@test.pe`, role: 'member' })).statusCode).toBe(200); // 4 de 4
    const pasada = await invitar(sesion, C.slug, { email: `e2-${sufijo()}@test.pe`, role: 'admin' });
    expect(pasada.statusCode).toBe(403);
    expect(pasada.json().error).toMatch(/hasta 4 personas/);
    expect((await invitar(sesion, C.slug, { email: `c1-${sufijo()}@test.pe`, role: 'client' })).statusCode).toBe(200);

    // Pasar un cliente a equipo también respeta el límite.
    const mCliente = await prismaAdmin.membership.findUniqueOrThrow({ where: { accountId_userId: { accountId: C.accountId, userId: C.clientId } } });
    const r = await pedir('PATCH', `/api/v1/personas/${mCliente.id}`, { cookie: sesion, cuenta: C.slug, body: { role: 'member' } });
    expect(r.statusCode).toBe(403);
  });

  it('al aceptar se vuelve a revisar (si bajaron el límite mientras tanto)', async () => {
    const C = await sembrarCuenta('C');
    const sesion = (await crearSesion(C.ownerId)).token;
    const email = `tarde-${sufijo()}@test.pe`;
    const enlace = (await invitar(sesion, C.slug, { email, role: 'member' })).json().enlace;
    await prismaAdmin.account.update({ where: { id: C.accountId }, data: { limits: { maxUsuarios: 2 } } });
    const r = await pedir('POST', '/api/v1/invitacion/aceptar', { body: { token: tokenDe(enlace), nombre: 'Tarde', password: CLAVE } });
    expect(r.statusCode).toBe(403);
    expect(await prismaAdmin.user.count({ where: { email } })).toBe(0);
    expect((await prismaAdmin.invitation.findFirstOrThrow({ where: { email } })).acceptedAt).toBeNull();
  });
});

describe('personas', () => {
  it('lista personas, invitaciones, uso del plan y permisos según el rol', async () => {
    const r = await pedir('GET', '/api/v1/personas', { cookie: owner, cuenta: A.slug });
    expect(r.statusCode).toBe(200);
    const d = r.json();
    expect(d.personas.length).toBeGreaterThanOrEqual(3);
    expect(d.personas.find((p: { esYo: boolean }) => p.esYo).role).toBe('owner');
    expect(d.permisos).toEqual({ gestionar: true, invitar: ['admin', 'member', 'client'] });
    expect(d.plan).toMatchObject({ nombre: 'Interno', maxUsuarios: null });

    const comoEquipo = (await pedir('GET', '/api/v1/personas', { cookie: member, cuenta: A.slug })).json();
    expect(comoEquipo.permisos).toEqual({ gestionar: false, invitar: ['client'] });
    expect(comoEquipo.invitaciones.every((i: { invitedById: string }) => i.invitedById === A.memberId)).toBe(true);

    expect((await pedir('GET', '/api/v1/personas', { cookie: client, cuenta: A.slug })).statusCode).toBe(403);
  });

  it('desactivar corta el acceso en la petición siguiente; reactivar lo devuelve', async () => {
    const C = await sembrarCuenta('C');
    const sesionOwner = (await crearSesion(C.ownerId)).token;
    const sesionMember = (await crearSesion(C.memberId)).token;
    const m = await prismaAdmin.membership.findUniqueOrThrow({ where: { accountId_userId: { accountId: C.accountId, userId: C.memberId } } });

    expect((await pedir('PATCH', `/api/v1/personas/${m.id}`, { cookie: sesionOwner, cuenta: C.slug, body: { status: 'disabled' } })).statusCode).toBe(200);
    expect((await pedir('GET', '/api/v1/yo', { cookie: sesionMember, cuenta: C.slug })).statusCode).toBe(403);
    expect((await pedir('PATCH', `/api/v1/personas/${m.id}`, { cookie: sesionOwner, cuenta: C.slug, body: { status: 'active', role: 'admin' } })).statusCode).toBe(200);
    expect((await pedir('GET', '/api/v1/yo', { cookie: sesionMember, cuenta: C.slug })).json().rol).toBe('admin');
  });

  it('no se toca al dueño, ni a uno mismo, ni lo hace el equipo, ni desde otra cuenta', async () => {
    const mOwner = await prismaAdmin.membership.findUniqueOrThrow({ where: { accountId_userId: { accountId: A.accountId, userId: A.ownerId } } });
    const mClient = await prismaAdmin.membership.findUniqueOrThrow({ where: { accountId_userId: { accountId: A.accountId, userId: A.clientId } } });
    const mMember = await prismaAdmin.membership.findUniqueOrThrow({ where: { accountId_userId: { accountId: A.accountId, userId: A.memberId } } });

    expect((await pedir('PATCH', `/api/v1/personas/${mOwner.id}`, { cookie: owner, cuenta: A.slug, body: { role: 'member' } })).statusCode).toBe(403);
    expect((await pedir('PATCH', `/api/v1/personas/${mClient.id}`, { cookie: member, cuenta: A.slug, body: { status: 'disabled' } })).statusCode).toBe(403);
    expect((await pedir('PATCH', `/api/v1/personas/${mMember.id}`, { cookie: owner, cuenta: A.slug, body: { role: 'owner' } })).statusCode).toBe(400);

    const ownerB = (await crearSesion(B.ownerId)).token;
    expect((await pedir('PATCH', `/api/v1/personas/${mMember.id}`, { cookie: ownerB, cuenta: B.slug, body: { status: 'disabled' } })).statusCode).toBe(404);

    // Un admin no puede cambiarse a sí mismo (para no quedarse fuera sin querer).
    const C = await sembrarCuenta('C');
    await prismaAdmin.membership.update({ where: { accountId_userId: { accountId: C.accountId, userId: C.memberId } }, data: { role: 'admin' } });
    const mAdmin = await prismaAdmin.membership.findUniqueOrThrow({ where: { accountId_userId: { accountId: C.accountId, userId: C.memberId } } });
    const sesionAdmin = (await crearSesion(C.memberId)).token;
    expect((await pedir('PATCH', `/api/v1/personas/${mAdmin.id}`, { cookie: sesionAdmin, cuenta: C.slug, body: { role: 'member' } })).statusCode).toBe(400);
  });
});

describe('soporte de Lucuma (beta)', () => {
  let soporte: string;
  beforeAll(async () => {
    const staff = await prismaAdmin.user.create({ data: { email: `soporte-${sufijo()}@lucuma.test`, name: 'Soporte', isStaff: true } });
    soporte = (await crearSesion(staff.id)).token;
  });

  it('en beta entra a cualquier cuenta como admin, marcado como soporte y registrado una vez', async () => {
    const C = await sembrarCuenta('C');
    const r = await pedir('GET', '/api/v1/yo', { cookie: soporte, cuenta: C.slug });
    expect(r.json()).toMatchObject({ rol: 'admin', soporte: true });
    await pedir('GET', '/api/v1/personas', { cookie: soporte, cuenta: C.slug });
    expect(await prismaAdmin.auditLog.count({ where: { accountId: C.accountId, action: 'soporte.acceso' } })).toBe(1);
    // Puede ayudar a invitar.
    expect((await invitar(soporte, C.slug, { email: `s-${sufijo()}@test.pe`, role: 'member' })).statusCode).toBe(200);
  });

  it('lista todas las cuentas abiertas; una persona normal no', async () => {
    const lista = await pedir('GET', '/api/v1/soporte/cuentas', { cookie: soporte });
    const slugs = lista.json().cuentas.map((c: { slug: string }) => c.slug);
    expect(slugs).toEqual(expect.arrayContaining([A.slug, B.slug]));
    expect((await pedir('GET', '/api/v1/soporte/cuentas', { cookie: owner })).statusCode).toBe(403);
  });

  it('fuera de la beta (SOPORTE_BETA=0) no entra sin membresía', async () => {
    expect((await pedir('GET', '/api/v1/yo', { cookie: soporte, cuenta: A.slug, aplicacion: appSinSoporte })).statusCode).toBe(403);
    expect((await pedir('GET', '/api/v1/soporte/cuentas', { cookie: soporte, aplicacion: appSinSoporte })).statusCode).toBe(403);
  });

  it('un miembro normal sigue con su rol aunque el soporte esté activo', async () => {
    expect((await pedir('GET', '/api/v1/yo', { cookie: member, cuenta: A.slug })).json()).toMatchObject({ rol: 'member', soporte: false });
  });
});

describe('config', () => {
  it('avisa que no hay correo saliente (la web oculta el acceso por enlace)', async () => {
    expect((await pedir('GET', '/api/v1/config')).json()).toEqual({ baseDomain: '', correo: false, sentry: null });
  });
});

/** Invitación creada directo en la base (casos que la API no permite armar). */
async function crearInvitacionManual(s: Semilla, email: string, role: 'member' | 'client', projectId?: string) {
  const token = `manual-${sufijo()}${sufijo()}${sufijo()}`;
  await prismaAdmin.invitation.create({
    data: { accountId: s.accountId, email, role, projectId, tokenHash: hashToken(token), invitedById: s.ownerId, expiresAt: new Date(Date.now() + 86_400_000) },
  });
  return { token };
}
