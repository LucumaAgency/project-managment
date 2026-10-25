/** Plantillas de lista (D-64): crear, agregar a un proyecto, guardar desde una lista, bot. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { crearSesion } from '../src/lib/sesion.js';
import { crearClave } from '../src/services/bot.js';
import { diaEn, sumarDias } from '../src/services/recordatorios.js';
import { cliente, type Cliente } from './http.js';
import { sembrarCuenta, type Semilla } from './semilla.js';

let app: FastifyInstance;
let A: Semilla;
let B: Semilla;
let owner: Cliente;
let member: Cliente;
let client: Cliente;
let ownerB: Cliente;
let clave: string;
let plantillaId: string;

const ONBOARDING = {
  name: 'Onboarding de cliente',
  description: 'Lo primero con cada cliente nuevo.',
  items: [
    { title: 'Datos de la empresa', notes: 'Razón social, RUC y contacto.', audience: 'client', dayOffset: 1 },
    { title: 'Verificar el depósito', audience: 'team', dayOffset: 2 },
    { title: 'Contrato firmado', audience: 'any' },
  ],
};

const bot = (metodo: 'GET' | 'POST', url: string, body?: object) =>
  app.inject({ method: metodo, url: `/api/v1${url}`, headers: { authorization: `Bearer ${clave}` }, ...(body ? { payload: body } : {}) });

async function listaConTareas(c: Cliente, projectId: string, listaId: string) {
  const r = await c.get(`/proyectos/${projectId}/tareas`);
  expect(r.status).toBe(200);
  return r.json.listas.find((l: { id: string }) => l.id === listaId);
}

beforeAll(async () => {
  [A, B] = await Promise.all([sembrarCuenta('A'), sembrarCuenta('B')]);
  app = await buildApp({ logger: false, baseDomain: '' });
  owner = cliente(app, (await crearSesion(A.ownerId)).token, A.slug);
  member = cliente(app, (await crearSesion(A.memberId)).token, A.slug);
  client = cliente(app, (await crearSesion(A.clientId)).token, A.slug);
  ownerB = cliente(app, (await crearSesion(B.ownerId)).token, B.slug);
  const u = await prismaAdmin.user.create({ data: { email: `bot-${A.slug}@bots.invalid`, name: 'Bot Lucuma', isBot: true } });
  await prismaAdmin.membership.create({ data: { accountId: A.accountId, userId: u.id, role: 'admin' } });
  clave = await crearClave(A.accountId, u.id, 'prueba');
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('crear y editar', () => {
  it('el dueño crea; el equipo la ve pero no la edita; el cliente ni la ve', async () => {
    const r = await owner.post('/plantillas', ONBOARDING);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    plantillaId = r.json.plantilla.id;
    expect(r.json.plantilla).toMatchObject({ name: 'Onboarding de cliente', tareas: 3, delCliente: 2 });
    expect(r.json.plantilla.items.map((i: { audience: string }) => i.audience)).toEqual(['client', 'team', 'any']);

    const lista = await member.get('/plantillas');
    expect(lista.json.plantillas.map((p: { id: string }) => p.id)).toContain(plantillaId);
    expect(lista.json.permisos.gestionar).toBe(false);
    expect((await member.post('/plantillas', ONBOARDING)).status).toBe(403);
    expect((await member.put(`/plantillas/${plantillaId}`, ONBOARDING)).status).toBe(403);

    expect((await client.get('/plantillas')).status).toBe(404);
    expect((await client.get(`/plantillas/${plantillaId}`)).status).toBe(404);
  });

  it('otra cuenta no la ve ni la toca', async () => {
    expect((await ownerB.get(`/plantillas/${plantillaId}`)).status).toBe(404);
    expect((await ownerB.put(`/plantillas/${plantillaId}`, ONBOARDING)).status).toBe(404);
    expect((await ownerB.get('/plantillas')).json.plantillas.map((p: { id: string }) => p.id)).not.toContain(plantillaId);
  });

  it('validaciones: nombre, día de 1 a 365', async () => {
    expect((await owner.post('/plantillas', { ...ONBOARDING, name: '  ' })).status).toBe(400);
    expect((await owner.post('/plantillas', { ...ONBOARDING, items: [{ title: 'x', audience: 'team', dayOffset: 0 }] })).status).toBe(400);
    expect((await owner.post('/plantillas', { ...ONBOARDING, items: [{ title: 'x', audience: 'jefe' }] })).status).toBe(400);
  });

  it('editar reemplaza las tareas en el orden nuevo; borrar la quita', async () => {
    const id = (await owner.post('/plantillas', ONBOARDING)).json.plantilla.id;
    const r = await owner.put(`/plantillas/${id}`, { name: 'Otra', items: [ONBOARDING.items[2], ONBOARDING.items[0]] });
    expect(r.json.plantilla.items.map((i: { title: string }) => i.title)).toEqual(['Contrato firmado', 'Datos de la empresa']);
    expect((await owner.delete(`/plantillas/${id}`)).status).toBe(200);
    expect((await owner.get(`/plantillas/${id}`)).status).toBe(404);
    expect(await prismaAdmin.listTemplateItem.count({ where: { templateId: id } })).toBe(0);
  });
});

describe('agregar a un proyecto', () => {
  let listaId: string;

  it('crea la lista con fechas desde el inicio y responsables según para quién es', async () => {
    const r = await member.post(`/proyectos/${A.projectId}/plantillas`, { plantillaId, inicio: '2030-01-06' });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json).toMatchObject({ tareas: 3, inicio: '2030-01-06', sinCliente: false });
    listaId = r.json.lista.id;

    const l = await listaConTareas(member, A.projectId, listaId);
    expect(l).toMatchObject({ title: 'Onboarding de cliente', visibleToClients: true });
    const [datos, deposito, contrato] = l.tareas;
    expect(datos).toMatchObject({ title: 'Datos de la empresa', dueOn: '2030-01-06', visibleToClients: true, tieneNotas: true });
    expect(datos.assignees.map((a: { userId: string }) => a.userId)).toEqual([A.clientId]);
    expect(deposito).toMatchObject({ dueOn: '2030-01-07', visibleToClients: false });
    expect(deposito.assignees.map((a: { userId: string }) => a.userId)).toEqual([A.memberId]);
    expect(contrato.dueOn).toBeNull();
    expect(contrato.assignees.map((a: { userId: string }) => a.userId).sort()).toEqual([A.memberId, A.clientId].sort());
  });

  it('el cliente ve solo lo suyo y lo de cualquiera, y le llegó el aviso', async () => {
    const l = await listaConTareas(client, A.projectId, listaId);
    expect(l.tareas.map((t: { title: string }) => t.title)).toEqual(['Datos de la empresa', 'Contrato firmado']);
    expect(await prismaAdmin.notification.count({ where: { userId: A.clientId, reason: 'assigned', recording: { parentId: listaId } } })).toBe(2);
    // Y puede completar las suyas.
    const t = l.tareas[0];
    expect((await client.post(`/tareas/${t.id}/completar`)).status).toBe(200);
  });

  it('queda en la actividad como quien la agregó', async () => {
    const creadas = await prismaAdmin.event.count({ where: { projectId: A.projectId, action: 'created', actorId: A.memberId, recording: { parentId: listaId } } });
    expect(creadas).toBe(3);
  });

  it('nombre, responsable y clientes a elección; con validaciones', async () => {
    const r = await owner.post(`/proyectos/${A.projectId}/plantillas`, { plantillaId, titulo: 'Onboarding Flecha', responsableId: A.ownerId, clienteIds: [] });
    expect(r.json).toMatchObject({ lista: { title: 'Onboarding Flecha' }, sinCliente: true });
    const l = await listaConTareas(owner, A.projectId, r.json.lista.id);
    expect(l.tareas[0].assignees).toEqual([]);
    expect(l.tareas[1].assignees.map((a: { userId: string }) => a.userId)).toEqual([A.ownerId]);
    // Sin inicio: hoy en la zona de la cuenta.
    expect(l.tareas[0].dueOn).toBe(diaEn('America/Lima'));
    expect(l.tareas[1].dueOn).toBe(sumarDias(diaEn('America/Lima'), 1));

    expect((await owner.post(`/proyectos/${A.projectId}/plantillas`, { plantillaId, responsableId: A.clientId })).status).toBe(400);
    expect((await owner.post(`/proyectos/${A.projectId}/plantillas`, { plantillaId, clienteIds: [A.memberId] })).status).toBe(400);
    expect((await owner.post(`/proyectos/${A.projectId}/plantillas`, { plantillaId, inicio: 'lunes' })).status).toBe(400);
  });

  it('un cliente no agrega plantillas; otra cuenta tampoco, ni a su proyecto con la de A', async () => {
    expect((await client.post(`/proyectos/${A.projectId}/plantillas`, { plantillaId })).status).toBe(404);
    expect((await ownerB.post(`/proyectos/${A.projectId}/plantillas`, { plantillaId })).status).toBe(404);
    expect((await ownerB.post(`/proyectos/${B.projectId}/plantillas`, { plantillaId })).status).toBe(404);
  });
});

describe('guardar una lista como plantilla', () => {
  it('fechas a "día N" desde que se creó la lista; personas a para quién es', async () => {
    const hoy = diaEn('America/Lima');
    const aplicada = await owner.post(`/proyectos/${A.projectId}/plantillas`, { plantillaId, inicio: hoy, titulo: 'Para copiar' });
    const r = await owner.post(`/listas/${aplicada.json.lista.id}/plantilla`, { name: 'Copia' });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.plantilla.name).toBe('Copia');
    expect(r.json.plantilla.items.map((i: { title: string; audience: string; dayOffset: number | null }) => [i.title, i.audience, i.dayOffset])).toEqual([
      ['Datos de la empresa', 'client', 1],
      ['Verificar el depósito', 'team', 2],
      ['Contrato firmado', 'any', null],
    ]);
    expect(r.json.plantilla.items[0].notes).toBe('Razón social, RUC y contacto.');
    expect((await member.post(`/listas/${aplicada.json.lista.id}/plantilla`, {})).status).toBe(403);
  });
});

describe('bot', () => {
  it('lista las plantillas y agrega una por nombre, sin asignarse nada', async () => {
    const l = (await bot('GET', '/bot/plantillas')).json().plantillas;
    expect(l.find((p: { id: string }) => p.id === plantillaId)).toMatchObject({ nombre: 'Onboarding de cliente', tareas: 3, delCliente: 2 });

    const r = await bot('POST', '/bot/plantillas/aplicar', { proyecto: 'web a', plantilla: 'onboarding de', inicio: '2030-02-01' });
    expect(r.statusCode, r.body).toBe(200);
    const d = r.json();
    expect(d).toMatchObject({ plantilla: 'Onboarding de cliente', tareas: 3, inicio: '2030-02-01', responsable: null });
    const tareas = await prismaAdmin.recording.findMany({ where: { parentId: d.listaId, type: 'todo' }, include: { assignees: true }, orderBy: { position: 'asc' } });
    expect(tareas).toHaveLength(3);
    expect(tareas[1].assignees).toEqual([]); // la del equipo, sin responsable
    expect(tareas[0].assignees.map((x) => x.userId)).toEqual([A.clientId]);
    expect(tareas[0].creatorId).not.toBe(A.memberId);
  });

  it('con responsable por nombre; nombre ambiguo o inexistente avisa', async () => {
    const nombre = (await prismaAdmin.user.findUniqueOrThrow({ where: { id: A.memberId } })).name;
    const r = await bot('POST', '/bot/plantillas/aplicar', { proyecto: A.projectId, plantilla: plantillaId, responsable: nombre });
    expect(r.json().responsable.nombre).toBe(nombre);
    expect((await bot('POST', '/bot/plantillas/aplicar', { proyecto: A.projectId, plantilla: 'no existe' })).statusCode).toBe(404);
    expect((await bot('POST', '/bot/plantillas/aplicar', { proyecto: A.projectId, plantilla: 'onboarding' })).statusCode).toBe(409); // la de la semilla y esta
  });

  it('el bot no aparece entre las personas que se pueden asignar o mencionar', async () => {
    const r = await owner.get(`/proyectos/${A.projectId}/mencionables`);
    expect(r.json.personas.some((p: { name: string }) => p.name === 'Bot Lucuma')).toBe(false);
  });
});
