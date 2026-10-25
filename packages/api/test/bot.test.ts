/** API para bots (D-63): clave, alcance, consultar, crear y completar tareas. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { usuariosEnUso } from '../src/lib/plan.js';
import { conCuenta } from '../src/lib/contexto.js';
import { crearSesion } from '../src/lib/sesion.js';
import { crearClave } from '../src/services/bot.js';
import { diaEn, sumarDias } from '../src/services/recordatorios.js';
import { cliente, type Cliente } from './http.js';
import { sembrarCuenta, type Semilla } from './semilla.js';

let app: FastifyInstance;
let A: Semilla;
let B: Semilla;
let owner: Cliente;
let clave: string;
let claveB: string;
let botId: string;
let p: string;
let lista: string;
let memberNombre: string;

async function nuevoBot(s: Semilla, nombre = 'Bot Lucuma') {
  const u = await prismaAdmin.user.create({ data: { email: `bot-${s.slug}-${Date.now()}@bots.invalid`, name: nombre, isBot: true } });
  await prismaAdmin.membership.create({ data: { accountId: s.accountId, userId: u.id, role: 'admin' } });
  return { id: u.id, clave: await crearClave(s.accountId, u.id, 'prueba') };
}
const pedir = (metodo: 'GET' | 'POST', url: string, k: string | null = clave, body?: object) =>
  app.inject({ method: metodo, url: `/api/v1${url}`, headers: k ? { authorization: `Bearer ${k}` } : {}, ...(body ? { payload: body } : {}) });

beforeAll(async () => {
  [A, B] = await Promise.all([sembrarCuenta('A'), sembrarCuenta('B')]);
  app = await buildApp({ logger: false, baseDomain: '' });
  owner = cliente(app, (await crearSesion(A.ownerId)).token, A.slug);
  const bot = await nuevoBot(A);
  clave = bot.clave;
  botId = bot.id;
  claveB = (await nuevoBot(B)).clave;
  memberNombre = (await prismaAdmin.user.findUniqueOrThrow({ where: { id: A.memberId } })).name;
  p = (await owner.post('/proyectos', { name: 'Fénix · Google Ads' })).json.proyecto.id;
  await owner.post('/proyectos', { name: 'Fénix · Web' });
  await owner.post(`/proyectos/${p}/personas`, { userId: A.memberId });
  lista = (await owner.post(`/proyectos/${p}/listas`, { title: 'Pendientes' })).json.lista.id;
  const hoy = diaEn('America/Lima');
  await owner.post(`/listas/${lista}/tareas`, { title: 'Para hoy', dueOn: hoy, assigneeIds: [A.memberId] });
  await owner.post(`/listas/${lista}/tareas`, { title: 'Vencida', dueOn: sumarDias(hoy, -3) });
  await owner.post(`/listas/${lista}/tareas`, { title: 'En cinco días', dueOn: sumarDias(hoy, 5) });
  await owner.post(`/listas/${lista}/tareas`, { title: 'Sin fecha' });
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('la clave', () => {
  it('sin clave, mal formada o inventada: 401', async () => {
    expect((await pedir('GET', '/bot/yo', null)).statusCode).toBe(401);
    expect((await pedir('GET', '/bot/yo', 'abc')).statusCode).toBe(401);
    expect((await pedir('GET', '/bot/yo', 'lpm_inventadainventadainventada')).statusCode).toBe(401);
  });

  it('con la clave: quién soy y en qué cuenta (sin elegir cuenta)', async () => {
    expect((await pedir('GET', '/bot/yo')).json()).toMatchObject({ bot: 'Bot Lucuma', cuenta: A.slug });
  });

  it('solo sirve en /bot: el resto de la API no la acepta', async () => {
    const r = await app.inject({ url: '/api/v1/proyectos', headers: { authorization: `Bearer ${clave}`, 'x-cuenta': A.slug } });
    expect(r.statusCode).toBe(401);
    const e = await app.inject({ url: '/api/v1/cuenta/exportar', headers: { authorization: `Bearer ${clave}`, 'x-cuenta': A.slug } });
    expect(e.statusCode).toBe(401);
  });

  it('una clave de alguien que no es bot no sirve; revocada tampoco', async () => {
    const deOwner = await crearClave(A.accountId, A.ownerId, 'no debería');
    expect((await pedir('GET', '/bot/yo', deOwner)).statusCode).toBe(401);
    const otra = await crearClave(A.accountId, botId, 'temporal');
    expect((await pedir('GET', '/bot/yo', otra)).statusCode).toBe(200);
    await prismaAdmin.apiKey.updateMany({ where: { prefix: otra.slice(0, 10) }, data: { revokedAt: new Date() } });
    expect((await pedir('GET', '/bot/yo', otra)).statusCode).toBe(401);
  });

  it('no se guarda la clave, solo su huella', async () => {
    const filas = await prismaAdmin.apiKey.findMany({ where: { accountId: A.accountId } });
    expect(JSON.stringify(filas)).not.toContain(clave);
  });

  it('el bot no cuenta para el límite de usuarios del plan', async () => {
    const conBot = await conCuenta({ accountId: A.accountId, userId: A.ownerId }, (tx) => usuariosEnUso(tx, A.accountId));
    const personas = await prismaAdmin.membership.count({ where: { accountId: A.accountId, status: 'active', role: { not: 'client' }, user: { isBot: false } } });
    expect(conBot).toBe(personas);
  });
});

describe('consultar', () => {
  it('proyectos y equipo (sin clientes ni bots)', async () => {
    const pr = (await pedir('GET', '/bot/proyectos')).json().proyectos;
    expect(pr.find((x: { id: string }) => x.id === p)).toMatchObject({ nombre: 'Fénix · Google Ads', tareasPendientes: 4 });
    const pe = (await pedir('GET', '/bot/personas')).json().personas.map((x: { correo: string }) => x.correo);
    const cliente = (await prismaAdmin.user.findUniqueOrThrow({ where: { id: A.clientId } })).email;
    expect(pe).not.toContain(cliente);
    expect(pe.some((c: string) => c.endsWith('@bots.invalid'))).toBe(false);
  });

  it('tareas por cuándo vencen, por proyecto (con o sin tilde) y por responsable (por nombre)', async () => {
    const titulos = async (q: string) => (await pedir('GET', `/bot/tareas?${q}`)).json().tareas.map((t: { titulo: string }) => t.titulo);
    expect(await titulos('cuando=hoy&proyecto=fenix google')).toEqual(['Para hoy']);
    expect(await titulos('cuando=vencidas&proyecto=fenix google')).toEqual(['Vencida']);
    expect(await titulos('cuando=semana&proyecto=fenix google')).toEqual(['Para hoy', 'En cinco días']);
    expect(await titulos(`responsable=${encodeURIComponent(memberNombre.split(' ')[0])}&proyecto=${p}`)).toEqual(['Para hoy']);
    const [t] = (await pedir('GET', '/bot/tareas?cuando=hoy&proyecto=fenix google')).json().tareas;
    expect(t.enlace).toContain(`/proyectos/${p}/tareas`);
    expect(t.responsables[0].nombre).toBe(memberNombre);
  });

  it('un nombre que coincide con varios proyectos pide precisar', async () => {
    const r = await pedir('GET', '/bot/tareas?proyecto=fenix');
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toContain('Fénix · Web');
  });
});

describe('crear y completar', () => {
  it('crea un proyecto; pedirlo otra vez (con otra escritura) devuelve el mismo', async () => {
    const r = (await pedir('POST', '/bot/proyectos', clave, { nombre: 'Comercial' })).json();
    expect(r).toMatchObject({ existia: false, proyecto: { nombre: 'Comercial' } });
    const otra = (await pedir('POST', '/bot/proyectos', clave, { nombre: 'comercial ' })).json();
    expect(otra).toMatchObject({ existia: true, proyecto: { id: r.proyecto.id } });
    expect((await prismaAdmin.project.findUniqueOrThrow({ where: { id: r.proyecto.id } })).createdById).toBe(botId);
    expect((await pedir('POST', '/bot/proyectos', clave, { nombre: '' })).statusCode).toBe(400);
  });

  it('crea con proyecto por nombre, en la primera lista, con fecha y responsable; figura como el bot', async () => {
    const r = await pedir('POST', '/bot/tareas', clave, { proyecto: 'google ads', titulo: 'Revisar títulos', vence: '2030-01-01', responsables: [memberNombre] });
    expect(r.statusCode).toBe(200);
    const t = r.json().tarea;
    expect(t).toMatchObject({ lista: 'Pendientes', vence: '2030-01-01', proyecto: { id: p } });
    const fila = await prismaAdmin.recording.findUniqueOrThrow({ where: { id: t.id }, include: { assignees: true } });
    expect(fila.creatorId).toBe(botId);
    expect(fila.assignees.map((x) => x.userId)).toEqual([A.memberId]);
    // Al responsable le llega el aviso, como si lo hubiera asignado una persona.
    expect(await prismaAdmin.notification.count({ where: { userId: A.memberId, recordingId: t.id, reason: 'assigned' } })).toBe(1);
  });

  it('una lista que no existe se crea', async () => {
    const t = (await pedir('POST', '/bot/tareas', clave, { proyecto: p, lista: 'Ideas', titulo: 'Probar anuncios de video' })).json().tarea;
    expect(t.lista).toBe('Ideas');
  });

  it('completa y reabre; queda en la actividad como el bot', async () => {
    const [t] = (await pedir('GET', '/bot/tareas?cuando=vencidas&proyecto=fenix google')).json().tareas;
    const c = (await pedir('POST', `/bot/tareas/${t.id}/completar`)).json().tarea;
    expect(c.completada).not.toBeNull();
    expect(await prismaAdmin.event.count({ where: { recordingId: t.id, action: 'completed', actorId: botId } })).toBe(1);
    expect((await pedir('GET', '/bot/tareas?cuando=vencidas&proyecto=fenix google')).json().tareas).toEqual([]);
    expect((await pedir('POST', `/bot/tareas/${t.id}/reabrir`)).json().tarea.completada).toBeNull();
  });

  it('validaciones con mensajes claros', async () => {
    expect((await pedir('POST', '/bot/tareas', clave, { proyecto: 'no existe', titulo: 'x' })).statusCode).toBe(404);
    expect((await pedir('POST', '/bot/tareas', clave, { proyecto: p, titulo: 'x', vence: 'mañana' })).statusCode).toBe(400);
    expect((await pedir('POST', '/bot/tareas', clave, { proyecto: p, titulo: 'x', responsables: ['nadie'] })).statusCode).toBe(404);
  });

  it('la clave de otra cuenta no ve ni toca nada de esta', async () => {
    expect((await pedir('GET', '/bot/tareas', claveB)).json().tareas.some((t: { proyecto: { id: string } }) => t.proyecto.id === p)).toBe(false);
    const [t] = (await pedir('GET', '/bot/tareas?proyecto=fenix google')).json().tareas;
    expect((await pedir('POST', `/bot/tareas/${t.id}/completar`, claveB)).statusCode).toBe(404);
    expect((await pedir('POST', '/bot/tareas', claveB, { proyecto: p, titulo: 'x' })).statusCode).toBe(404);
  });
});
