/** Día 5: proyectos, personas del proyecto, elementos genéricos, visibilidad para clientes y papelera. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { crearSesion } from '../src/lib/sesion.js';
import { cliente, type Cliente } from './http.js';
import { sembrarCuenta, unirACuenta, type Semilla } from './semilla.js';

let app: FastifyInstance;
let A: Semilla;
let B: Semilla;
let owner: Cliente;
let member: Cliente;
let client: Cliente;
let otroMember: Cliente; // del equipo de A, en ningún proyecto
let otroMemberId: string;
let ownerB: Cliente;

const sesion = async (userId: string, s: Semilla) => cliente(app, (await crearSesion(userId)).token, s.slug);

/** Proyecto nuevo creado por `quien`, con el equipo y el cliente de A dentro. */
async function proyectoConTodos(quien: Cliente = owner, nombre = 'Campaña') {
  const r = await quien.post('/proyectos', { name: nombre });
  expect(r.status).toBe(200);
  const id = r.json.proyecto.id as string;
  for (const userId of [A.memberId, A.clientId]) await owner.post(`/proyectos/${id}/personas`, { userId });
  return id;
}

beforeAll(async () => {
  [A, B] = await Promise.all([sembrarCuenta('A'), sembrarCuenta('B')]);
  app = await buildApp({ logger: false, baseDomain: '' });
  const extra = await prismaAdmin.user.create({ data: { email: `otro-${A.slug}@test.pe`, name: 'Otro A' } });
  otroMemberId = extra.id;
  await unirACuenta(extra.id, A.accountId, 'member');
  [owner, member, client, otroMember, ownerB] = await Promise.all([
    sesion(A.ownerId, A),
    sesion(A.memberId, A),
    sesion(A.clientId, A),
    sesion(extra.id, A),
    sesion(B.ownerId, B),
  ]);
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('proyectos', () => {
  it('el equipo crea un proyecto, queda dentro, y se registra el evento', async () => {
    const r = await member.post('/proyectos', { name: '  Web nueva  ', description: 'Rediseño' });
    expect(r.status).toBe(200);
    expect(r.json.proyecto).toMatchObject({ name: 'Web nueva', description: 'Rediseño', status: 'active' });
    const id = r.json.proyecto.id;
    expect(await prismaAdmin.projectMember.count({ where: { projectId: id, userId: A.memberId } })).toBe(1);
    expect(await prismaAdmin.event.count({ where: { projectId: id, action: 'created', recordingId: null } })).toBe(1);
  });

  it('un cliente no crea proyectos; sin nombre no se crea', async () => {
    expect((await client.post('/proyectos', { name: 'X' })).status).toBe(403);
    expect((await owner.post('/proyectos', { name: '   ' })).status).toBe(400);
  });

  it('owner ve todos; el equipo y el cliente, solo donde están', async () => {
    const soloOwner = (await owner.post('/proyectos', { name: 'Privado del dueño' })).json.proyecto.id;
    const conTodos = await proyectoConTodos();
    const ids = async (c: Cliente) => (await c.get('/proyectos')).json.proyectos.map((p: { id: string }) => p.id);

    expect(await ids(owner)).toEqual(expect.arrayContaining([soloOwner, conTodos]));
    expect(await ids(member)).toContain(conTodos);
    expect(await ids(member)).not.toContain(soloOwner);
    expect(await ids(client)).toContain(conTodos);
    expect(await ids(client)).not.toContain(soloOwner);
    expect(await ids(otroMember)).not.toContain(conTodos);

    expect((await member.get(`/proyectos/${soloOwner}`)).status).toBe(404);
    expect((await otroMember.get(`/proyectos/${conTodos}`)).status).toBe(404);
    expect((await ownerB.get(`/proyectos/${conTodos}`)).status).toBe(404); // otra cuenta
    expect((await client.get('/proyectos')).json.puedeCrear).toBe(false);
  });

  it('el detalle trae personas, secciones y permisos; el cliente no ve correos', async () => {
    const id = await proyectoConTodos();
    const deOwner = (await owner.get(`/proyectos/${id}`)).json;
    expect(deOwner.personas.map((p: { userId: string }) => p.userId).sort()).toEqual([A.ownerId, A.memberId, A.clientId].sort());
    expect(deOwner.personas.every((p: { email: string | null }) => p.email)).toBe(true);
    expect(deOwner.secciones).toEqual({ tareas: 0, mensajes: 0, archivos: 0 });
    expect(deOwner.permisos).toMatchObject({ editar: true, archivar: true, papelera: true, personas: true, verPapelera: true });

    const deCliente = (await client.get(`/proyectos/${id}`)).json;
    expect(deCliente.personas.every((p: { email: string | null }) => p.email === null)).toBe(true);
    expect(deCliente.permisos).toMatchObject({ editar: false, archivar: false, personas: false, verPapelera: false });
    const deMember = (await member.get(`/proyectos/${id}`)).json;
    expect(deMember.permisos).toMatchObject({ editar: true, archivar: false, personas: true });
  });

  it('editar: el equipo del proyecto sí; el cliente no', async () => {
    const id = await proyectoConTodos();
    expect((await member.patch(`/proyectos/${id}`, { name: 'Renombrado' })).json.proyecto.name).toBe('Renombrado');
    expect((await client.patch(`/proyectos/${id}`, { name: 'Hack' })).status).toBe(403);
    expect((await otroMember.patch(`/proyectos/${id}`, { name: 'Hack' })).status).toBe(404);
  });

  it('archivar deja el proyecto en solo lectura; reactivar lo devuelve', async () => {
    const id = await proyectoConTodos();
    const lista = (await member.post(`/proyectos/${id}/elementos`, { type: 'todolist', title: 'Lista' })).json.elemento.id;
    expect((await member.post(`/proyectos/${id}/archivar`)).status).toBe(403); // no lo creó
    expect((await owner.post(`/proyectos/${id}/archivar`)).json.proyecto.status).toBe('archived');

    expect((await member.get(`/proyectos/${id}`)).status).toBe(200); // se sigue viendo
    expect((await member.get(`/proyectos/${id}/elementos?padre=${lista}`)).status).toBe(200);
    expect((await member.post(`/proyectos/${id}/elementos`, { type: 'todo', parentId: lista, title: 'X' })).status).toBe(403);
    expect((await member.patch(`/elementos/${lista}`, { title: 'X' })).status).toBe(403);
    expect((await member.patch(`/proyectos/${id}`, { name: 'X' })).status).toBe(403);
    expect((await member.get('/proyectos?estado=archived')).json.proyectos.map((p: { id: string }) => p.id)).toContain(id);
    expect((await owner.post(`/proyectos/${id}/archivar`)).status).toBe(409);

    expect((await owner.post(`/proyectos/${id}/reactivar`)).json.proyecto.status).toBe('active');
    expect((await member.post(`/proyectos/${id}/elementos`, { type: 'todo', parentId: lista, title: 'Ya se puede' })).status).toBe(200);
  });

  it('papelera: deja de verse para el equipo; owner la ve y restaura', async () => {
    const id = await proyectoConTodos(member);
    expect((await client.post(`/proyectos/${id}/papelera`)).status).toBe(403);
    expect((await member.post(`/proyectos/${id}/papelera`)).json.proyecto.status).toBe('trashed'); // lo creó
    expect((await member.get(`/proyectos/${id}`)).status).toBe(404);
    expect((await member.get('/proyectos?estado=trashed')).status).toBe(403);
    expect((await owner.get('/proyectos?estado=trashed')).json.proyectos.map((p: { id: string }) => p.id)).toContain(id);
    expect((await member.post(`/proyectos/${id}/restaurar`)).status).toBe(404);
    expect((await owner.post(`/proyectos/${id}/restaurar`)).json.proyecto.status).toBe('active');
    expect((await member.get(`/proyectos/${id}`)).status).toBe(200);
  });

  it('respeta el límite de proyectos del plan (al crear y al reactivar)', async () => {
    const C = await sembrarCuenta('C'); // la semilla trae 1 proyecto activo
    await prismaAdmin.account.update({ where: { id: C.accountId }, data: { limits: { maxProyectos: 2 } } });
    const dueño = await sesion(C.ownerId, C);
    const segundo = (await dueño.post('/proyectos', { name: 'Segundo' })).json.proyecto.id;
    const tercero = await dueño.post('/proyectos', { name: 'Tercero' });
    expect(tercero.status).toBe(403);
    expect(tercero.json.error).toMatch(/hasta 2 proyectos/);
    await dueño.post(`/proyectos/${segundo}/archivar`);
    const otro = (await dueño.post('/proyectos', { name: 'Ahora sí' })).json.proyecto.id;
    expect(otro).toBeTruthy();
    expect((await dueño.post(`/proyectos/${segundo}/reactivar`)).status).toBe(403);
  });
});

describe('personas del proyecto', () => {
  it('sumar a alguien de la cuenta y quitarlo; no a alguien de otra cuenta', async () => {
    const id = (await member.post('/proyectos', { name: 'Equipo chico' })).json.proyecto.id;
    const r = await member.post(`/proyectos/${id}/personas`, { userId: otroMemberId });
    expect(r.json.personas.map((p: { userId: string }) => p.userId)).toContain(otroMemberId);
    expect((await otroMember.get(`/proyectos/${id}`)).status).toBe(200);
    expect((await member.post(`/proyectos/${id}/personas`, { userId: B.memberId })).status).toBe(404);

    const sin = await member.delete(`/proyectos/${id}/personas/${otroMemberId}`);
    expect(sin.json.personas.map((p: { userId: string }) => p.userId)).not.toContain(otroMemberId);
    expect((await otroMember.get(`/proyectos/${id}`)).status).toBe(404);
    expect(await prismaAdmin.event.count({ where: { projectId: id, action: { in: ['member_added', 'member_removed'] } } })).toBe(2);
  });

  it('un cliente no suma ni quita personas', async () => {
    const id = await proyectoConTodos();
    expect((await client.post(`/proyectos/${id}/personas`, { userId: otroMemberId })).status).toBe(403);
    expect((await client.delete(`/proyectos/${id}/personas/${A.memberId}`)).status).toBe(403);
  });
});

describe('elementos genéricos', () => {
  it('crear respeta dónde puede ir cada tipo y registra el evento', async () => {
    const id = await proyectoConTodos();
    const lista = (await member.post(`/proyectos/${id}/elementos`, { type: 'todolist', title: 'Diseño' })).json.elemento;
    expect(lista).toMatchObject({ type: 'todolist', parentId: null, position: 1, visibleToClients: false, creator: { id: A.memberId } });
    const t1 = (await member.post(`/proyectos/${id}/elementos`, { type: 'todo', parentId: lista.id, title: 'Logo' })).json.elemento;
    const t2 = (await member.post(`/proyectos/${id}/elementos`, { type: 'todo', parentId: lista.id, title: 'Paleta' })).json.elemento;
    expect([t1.position, t2.position]).toEqual([1, 2]);

    expect((await member.post(`/proyectos/${id}/elementos`, { type: 'todo', title: 'Suelta' })).status).toBe(400); // tarea sin lista
    const msg = (await member.post(`/proyectos/${id}/elementos`, { type: 'message', title: 'Brief' })).json.elemento;
    expect((await member.post(`/proyectos/${id}/elementos`, { type: 'todo', parentId: msg.id, title: 'X' })).status).toBe(400);
    expect((await member.post(`/proyectos/${id}/elementos`, { type: 'comment', bodyText: 'sin padre' })).status).toBe(400);
    expect((await member.post(`/proyectos/${id}/elementos`, { type: 'message' })).status).toBe(400); // sin título
    expect((await member.post(`/proyectos/${id}/elementos`, { type: 'upload', title: 'a.pdf' })).status).toBe(400); // por la ruta de archivos

    const hijos = (await member.get(`/proyectos/${id}/elementos?padre=${lista.id}`)).json.elementos;
    expect(hijos.map((h: { title: string }) => h.title)).toEqual(['Logo', 'Paleta']);
    expect((await member.get(`/proyectos/${id}`)).json.secciones).toEqual({ tareas: 1, mensajes: 1, archivos: 0 });
    expect(await prismaAdmin.event.count({ where: { projectId: id, action: 'created', recordingId: { not: null } } })).toBe(4);
  });

  it('no se puede colgar algo de un elemento de otro proyecto', async () => {
    const p1 = await proyectoConTodos();
    const p2 = await proyectoConTodos();
    const lista = (await owner.post(`/proyectos/${p1}/elementos`, { type: 'todolist', title: 'L' })).json.elemento.id;
    expect((await owner.post(`/proyectos/${p2}/elementos`, { type: 'todo', parentId: lista, title: 'X' })).status).toBe(404);
    expect((await ownerB.post(`/proyectos/${p1}/elementos`, { type: 'todolist', title: 'X' })).status).toBe(404);
  });

  it('editar: quien lo creó o un admin; otro del equipo no', async () => {
    const id = await proyectoConTodos();
    const msg = (await member.post(`/proyectos/${id}/elementos`, { type: 'message', title: 'Original' })).json.elemento.id;
    expect((await member.patch(`/elementos/${msg}`, { title: 'Cambiado', bodyText: 'Hola' })).json.elemento).toMatchObject({ title: 'Cambiado', bodyText: 'Hola' });
    await owner.post(`/proyectos/${id}/personas`, { userId: otroMemberId });
    expect((await otroMember.patch(`/elementos/${msg}`, { title: 'Ajeno' })).status).toBe(403);
    expect((await owner.patch(`/elementos/${msg}`, { title: 'Del dueño' })).status).toBe(200);
    const ev = await prismaAdmin.event.findFirst({ where: { recordingId: msg, action: 'updated' }, orderBy: { createdAt: 'asc' } });
    expect(ev?.details).toEqual({ title: { from: 'Original', to: 'Cambiado' } });
  });

  it('papelera: desaparece con lo de adentro; restaurar lo devuelve todo', async () => {
    const id = await proyectoConTodos();
    const lista = (await member.post(`/proyectos/${id}/elementos`, { type: 'todolist', title: 'Lista' })).json.elemento.id;
    const tarea = (await member.post(`/proyectos/${id}/elementos`, { type: 'todo', parentId: lista, title: 'Tarea' })).json.elemento.id;

    await owner.post(`/proyectos/${id}/personas`, { userId: otroMemberId });
    expect((await otroMember.post(`/elementos/${lista}/papelera`)).status).toBe(403);
    expect((await member.post(`/elementos/${lista}/papelera`)).json.elemento.status).toBe('trashed');

    expect((await member.get(`/proyectos/${id}/elementos`)).json.elementos.map((e: { id: string }) => e.id)).not.toContain(lista);
    expect((await owner.get(`/elementos/${tarea}`)).status).toBe(404); // su padre está en la papelera
    expect((await member.post(`/proyectos/${id}/elementos`, { type: 'todo', parentId: lista, title: 'X' })).status).toBe(409);

    const papelera = (await owner.get(`/proyectos/${id}/papelera`)).json.elementos.map((e: { id: string }) => e.id);
    expect(papelera).toEqual([lista]); // solo la raíz de lo borrado
    expect((await member.get(`/proyectos/${id}/papelera`)).status).toBe(403);

    expect((await member.post(`/elementos/${lista}/restaurar`)).json.elemento.status).toBe('active');
    expect((await member.get(`/elementos/${tarea}`)).status).toBe(200);
    expect((await member.post(`/elementos/${lista}/restaurar`)).status).toBe(409);
    expect(await prismaAdmin.event.count({ where: { recordingId: lista, action: { in: ['trashed', 'restored'] } } })).toBe(2);
  });
});

describe('visibilidad para clientes', () => {
  it('el cliente no ve lo interno: ni en la lista, ni por id, ni lo que cuelga de ello', async () => {
    const id = await proyectoConTodos();
    const interno = (await member.post(`/proyectos/${id}/elementos`, { type: 'todolist', title: 'Interna' })).json.elemento.id;
    // Hija marcada visible dentro de una lista interna: igual no se ve (la cadena manda).
    const hija = (await member.post(`/proyectos/${id}/elementos`, { type: 'todo', parentId: interno, title: 'Hija', visibleToClients: true })).json.elemento.id;
    const visible = (await member.post(`/proyectos/${id}/elementos`, { type: 'todolist', title: 'Para el cliente', visibleToClients: true })).json.elemento.id;

    const raiz = (await client.get(`/proyectos/${id}/elementos`)).json.elementos.map((e: { id: string }) => e.id);
    expect(raiz).toEqual([visible]);
    expect((await client.get(`/elementos/${interno}`)).status).toBe(404);
    expect((await client.get(`/elementos/${hija}`)).status).toBe(404);
    expect((await client.get(`/proyectos/${id}/elementos?padre=${interno}`)).status).toBe(404);
    expect((await client.get(`/elementos/${visible}`)).status).toBe(200);
    expect((await client.get(`/proyectos/${id}`)).json.secciones.tareas).toBe(1);
  });

  it('lo que crea el cliente nace visible; solo crea tareas, mensajes y comentarios', async () => {
    const id = await proyectoConTodos();
    const visible = (await member.post(`/proyectos/${id}/elementos`, { type: 'todolist', title: 'Visible', visibleToClients: true })).json.elemento.id;
    const interno = (await member.post(`/proyectos/${id}/elementos`, { type: 'todolist', title: 'Interna' })).json.elemento.id;

    const msg = await client.post(`/proyectos/${id}/elementos`, { type: 'message', title: 'Duda', visibleToClients: false });
    expect(msg.json.elemento.visibleToClients).toBe(true);
    expect((await client.post(`/proyectos/${id}/elementos`, { type: 'todo', parentId: visible, title: 'Pedido' })).status).toBe(200);
    expect((await client.post(`/proyectos/${id}/elementos`, { type: 'todolist', title: 'X' })).status).toBe(403);
    expect((await client.post(`/proyectos/${id}/elementos`, { type: 'folder', title: 'X' })).status).toBe(403);
    expect((await client.post(`/proyectos/${id}/elementos`, { type: 'todo', parentId: interno, title: 'X' })).status).toBe(404);
  });

  it('el comentario copia la visibilidad de lo que comenta', async () => {
    const id = await proyectoConTodos();
    const interno = (await member.post(`/proyectos/${id}/elementos`, { type: 'message', title: 'Interno' })).json.elemento.id;
    const visible = (await member.post(`/proyectos/${id}/elementos`, { type: 'message', title: 'Público', visibleToClients: true })).json.elemento.id;
    const c1 = (await member.post(`/proyectos/${id}/elementos`, { type: 'comment', parentId: interno, bodyText: 'ojo', visibleToClients: true })).json.elemento;
    const c2 = (await member.post(`/proyectos/${id}/elementos`, { type: 'comment', parentId: visible, bodyText: 'listo' })).json.elemento;
    expect([c1.visibleToClients, c2.visibleToClients]).toEqual([false, true]);
    expect((await client.get(`/proyectos/${id}/elementos?padre=${visible}`)).json.elementos.map((e: { id: string }) => e.id)).toEqual([c2.id]);
    // Y el evento del comentario interno no queda visible para el feed del cliente.
    expect((await prismaAdmin.event.findFirstOrThrow({ where: { recordingId: c1.id } })).visibleToClients).toBe(false);
  });

  it('cambiar la visibilidad: el equipo sí, el cliente no; queda en la actividad', async () => {
    const id = await proyectoConTodos();
    const msg = (await member.post(`/proyectos/${id}/elementos`, { type: 'message', title: 'Se publica' })).json.elemento.id;
    expect((await client.get(`/elementos/${msg}`)).status).toBe(404);
    expect((await member.patch(`/elementos/${msg}`, { visibleToClients: true })).status).toBe(200);
    expect((await client.get(`/elementos/${msg}`)).json.permisos).toEqual({ editar: false, papelera: false, cambiarVisibilidad: false });

    const propio = (await client.post(`/proyectos/${id}/elementos`, { type: 'message', title: 'Mío' })).json.elemento.id;
    expect((await client.patch(`/elementos/${propio}`, { visibleToClients: false })).status).toBe(403);
    expect((await client.patch(`/elementos/${propio}`, { title: 'Mío editado' })).status).toBe(200);
    expect((await client.patch(`/elementos/${msg}`, { title: 'Ajeno' })).status).toBe(403);
    expect(await prismaAdmin.event.count({ where: { recordingId: msg, action: 'visibility_changed' } })).toBe(1);
  });
});
