/** Día 7: tareas (listas, responsables, fecha, completar, mover) y lo que ve y hace un cliente. */
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
let otro: Cliente; // del equipo de A, en el proyecto
let otroId: string;
let fueraId: string; // del equipo de A, fuera del proyecto
let projectId: string;

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

async function lista(titulo = 'Diseño', visible = false, quien: Cliente = member) {
  const r = await quien.post(`/proyectos/${projectId}/listas`, { title: titulo, visibleToClients: visible });
  expect(r.status).toBe(200);
  return r.json.lista.id as string;
}
async function tarea(listaId: string, datos: object = {}, quien: Cliente = member) {
  const r = await quien.post(`/listas/${listaId}/tareas`, { title: 'Tarea', ...datos });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return r.json.tarea;
}

beforeAll(async () => {
  [A, B] = await Promise.all([sembrarCuenta('A'), sembrarCuenta('B')]);
  app = await buildApp({ logger: false, baseDomain: '' });
  const [u1, u2] = await Promise.all(
    ['otro', 'fuera'].map((n) => prismaAdmin.user.create({ data: { email: `${n}-${A.slug}@test.pe`, name: n } }))
  );
  otroId = u1.id;
  fueraId = u2.id;
  await unirACuenta(otroId, A.accountId, 'member');
  await unirACuenta(fueraId, A.accountId, 'member');
  const sesion = async (id: string) => cliente(app, (await crearSesion(id)).token, A.slug);
  [owner, member, client, otro] = await Promise.all([sesion(A.ownerId), sesion(A.memberId), sesion(A.clientId), sesion(otroId)]);
  projectId = (await owner.post('/proyectos', { name: 'Tareas' })).json.proyecto.id;
  for (const userId of [A.memberId, A.clientId, otroId]) await owner.post(`/proyectos/${projectId}/personas`, { userId });
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('crear y listar', () => {
  it('lista con tareas: fecha, responsables y notas con el editor; en orden', async () => {
    const l = await lista('Lanzamiento');
    const t1 = await tarea(l, {
      title: 'Logo',
      dueOn: '2026-11-06',
      assigneeIds: [A.memberId, otroId],
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'versión final' }] }] },
    });
    expect(t1).toMatchObject({ title: 'Logo', dueOn: '2026-11-06', completedAt: null, tieneNotas: true, bodyHtml: '<p>versión final</p>' });
    expect(t1.assignees.map((a: { userId: string }) => a.userId).sort()).toEqual([A.memberId, otroId].sort());
    const t2 = await tarea(l, { title: 'Paleta' });

    const r = (await member.get(`/proyectos/${projectId}/tareas`)).json;
    const laLista = r.listas.find((x: { id: string }) => x.id === l);
    expect(ids(laLista.tareas)).toEqual([t1.id, t2.id]);
    expect(laLista.permisos).toEqual({ editar: true, papelera: true, agregar: true, mover: true });
    expect(r.permisos).toMatchObject({ crearLista: true, asignar: true });
    expect(await prismaAdmin.event.count({ where: { recordingId: t1.id, action: 'assigned' } })).toBe(1);
  });

  it('fecha inválida o inexistente: 400', async () => {
    const l = await lista();
    expect((await member.post(`/listas/${l}/tareas`, { title: 'X', dueOn: '06/11/2026' })).status).toBe(400);
    expect((await member.post(`/listas/${l}/tareas`, { title: 'X', dueOn: '2026-02-30' })).status).toBe(400);
  });

  it('una tarea solo va dentro de una lista', async () => {
    const msg = (await member.post(`/proyectos/${projectId}/elementos`, { type: 'message', title: 'M' })).json.elemento.id;
    expect((await member.post(`/listas/${msg}/tareas`, { title: 'X' })).status).toBe(400);
  });
});

describe('responsables', () => {
  it('solo quien ve la tarea; nunca alguien de fuera del proyecto ni de otra cuenta', async () => {
    const l = await lista();
    expect((await member.post(`/listas/${l}/tareas`, { title: 'X', assigneeIds: [fueraId] })).status).toBe(400);
    expect((await member.post(`/listas/${l}/tareas`, { title: 'X', assigneeIds: [B.memberId] })).status).toBe(400);
    // Tarea interna: el cliente no puede ser responsable.
    expect((await member.post(`/listas/${l}/tareas`, { title: 'X', assigneeIds: [A.clientId] })).status).toBe(400);
  });

  it('cambiar responsables registra quién entra y quién sale', async () => {
    const l = await lista();
    const t = await tarea(l, { assigneeIds: [A.memberId] });
    const r = await otro.patch(`/tareas/${t.id}`, { assigneeIds: [otroId] });
    expect(r.json.tarea.assignees.map((a: { userId: string }) => a.userId)).toEqual([otroId]);
    expect(await prismaAdmin.event.count({ where: { recordingId: t.id, action: 'unassigned' } })).toBe(1);
  });

  it('si la tarea pasa a interna, el cliente deja de ser responsable', async () => {
    const l = await lista('Visible', true);
    const t = await tarea(l, { visibleToClients: true, assigneeIds: [A.clientId, A.memberId] });
    expect(t.assignees).toHaveLength(2);
    const r = await member.patch(`/tareas/${t.id}`, { visibleToClients: false });
    expect(r.json.tarea.assignees.map((a: { userId: string }) => a.userId)).toEqual([A.memberId]);
  });
});

describe('completar y reabrir', () => {
  it('cualquiera del equipo completa; queda quién y cuándo; reabrir lo limpia', async () => {
    const l = await lista();
    const t = await tarea(l);
    const c = (await otro.post(`/tareas/${t.id}/completar`)).json.tarea;
    expect(c.completedBy).toEqual({ id: otroId, name: 'otro' });
    expect(c.completedAt).toBeTruthy();
    expect((await otro.post(`/tareas/${t.id}/completar`)).json.tarea.completedAt).toBe(c.completedAt); // dos veces: sin cambio
    expect((await member.post(`/tareas/${t.id}/reabrir`)).json.tarea).toMatchObject({ completedAt: null, completedBy: null });
    expect(await prismaAdmin.event.count({ where: { recordingId: t.id, action: { in: ['completed', 'reopened'] } } })).toBe(2);
  });

  it('el cliente completa solo lo que le asignaron o lo que creó', async () => {
    const l = await lista('Para el cliente', true);
    const ajena = await tarea(l, { visibleToClients: true });
    const asignada = await tarea(l, { visibleToClients: true, assigneeIds: [A.clientId] });
    const propia = await tarea(l, { title: 'Del cliente' }, client);
    expect((await client.post(`/tareas/${ajena.id}/completar`)).status).toBe(403);
    expect((await client.post(`/tareas/${asignada.id}/completar`)).status).toBe(200);
    expect((await client.post(`/tareas/${propia.id}/completar`)).status).toBe(200);
  });

  it('en un proyecto archivado no se completa nada', async () => {
    const p = (await owner.post('/proyectos', { name: 'Archivable' })).json.proyecto.id;
    const l = (await owner.post(`/proyectos/${p}/listas`, { title: 'L' })).json.lista.id;
    const t = (await owner.post(`/listas/${l}/tareas`, { title: 'T' })).json.tarea;
    await owner.post(`/proyectos/${p}/archivar`);
    expect((await owner.post(`/tareas/${t.id}/completar`)).status).toBe(403);
  });
});

describe('lo que ve y hace un cliente', () => {
  it('solo listas y tareas visibles; no ve lo interno ni por id', async () => {
    const visible = await lista('Visible', true);
    const interna = await lista('Interna', false);
    const tv = await tarea(visible, { visibleToClients: true });
    const tiDeVisible = await tarea(visible, { title: 'interna en lista visible' });
    const tiDeInterna = await tarea(interna, { visibleToClients: true });

    const r = (await client.get(`/proyectos/${projectId}/tareas`)).json;
    expect(ids(r.listas)).toContain(visible);
    expect(ids(r.listas)).not.toContain(interna);
    const v = r.listas.find((x: { id: string }) => x.id === visible);
    expect(ids(v.tareas)).toContain(tv.id);
    expect(ids(v.tareas)).not.toContain(tiDeVisible.id);
    expect(r.permisos).toMatchObject({ crearLista: false, asignar: false });
    for (const id of [tiDeVisible.id, tiDeInterna.id]) expect((await client.get(`/tareas/${id}`)).status).toBe(404);
  });

  it('el cliente crea tareas (nacen visibles) pero no pone responsables ni fecha', async () => {
    const l = await lista('Pedidos', true);
    const t = await tarea(l, { title: 'Cambiar foto' }, client);
    expect(t.visibleToClients).toBe(true);
    expect((await client.post(`/listas/${l}/tareas`, { title: 'X', dueOn: '2026-12-01' })).status).toBe(403);
    expect((await client.patch(`/tareas/${t.id}`, { assigneeIds: [A.clientId] })).status).toBe(403);
  });
});

describe('mover', () => {
  it('reordenar dentro de la lista y pasar a otra', async () => {
    const l1 = await lista('L1');
    const l2 = await lista('L2');
    const [a, b, c] = [await tarea(l1, { title: 'a' }), await tarea(l1, { title: 'b' }), await tarea(l1, { title: 'c' })];
    const orden = async (l: string) =>
      (await member.get(`/proyectos/${projectId}/tareas`)).json.listas.find((x: { id: string }) => x.id === l).tareas.map((t: { title: string }) => t.title);

    await member.post(`/elementos/${c.id}/mover`, { despuesDe: null }); // c primero
    expect(await orden(l1)).toEqual(['c', 'a', 'b']);
    await member.post(`/elementos/${c.id}/mover`, { despuesDe: a.id }); // entre a y b
    expect(await orden(l1)).toEqual(['a', 'c', 'b']);
    await member.post(`/elementos/${b.id}/mover`, { parentId: l2, despuesDe: null });
    expect(await orden(l1)).toEqual(['a', 'c']);
    expect(await orden(l2)).toEqual(['b']);
    expect(await prismaAdmin.event.count({ where: { recordingId: b.id, action: 'moved' } })).toBe(1);
  });

  it('muchas inserciones en el mismo hueco renumeran sin perder el orden', async () => {
    const l = await lista('Hueco');
    const a = await tarea(l, { title: 'a' });
    await tarea(l, { title: 'z' });
    // Insertar 40 veces justo después de "a": el hueco se achica hasta renumerar.
    const titulos = ['a'];
    for (let i = 0; i < 40; i++) {
      const t = await tarea(l, { title: `n${i}` });
      await member.post(`/elementos/${t.id}/mover`, { despuesDe: a.id });
      titulos.splice(1, 0, `n${i}`);
    }
    titulos.push('z');
    const r = (await member.get(`/proyectos/${projectId}/tareas`)).json.listas.find((x: { id: string }) => x.id === l);
    expect(r.tareas.map((t: { title: string }) => t.title)).toEqual(titulos);
  });

  it('no se mueve a algo que no es una lista, ni a otro proyecto; el cliente no reordena', async () => {
    const l = await lista('Origen', true);
    const t = await tarea(l, { visibleToClients: true });
    const msg = (await member.post(`/proyectos/${projectId}/elementos`, { type: 'message', title: 'M' })).json.elemento.id;
    expect((await member.post(`/elementos/${t.id}/mover`, { parentId: msg, despuesDe: null })).status).toBe(400);
    const otroProyecto = (await owner.post('/proyectos', { name: 'Otro' })).json.proyecto.id;
    const lOtro = (await owner.post(`/proyectos/${otroProyecto}/listas`, { title: 'X' })).json.lista.id;
    expect((await owner.post(`/elementos/${t.id}/mover`, { parentId: lOtro, despuesDe: null })).status).toBe(404);
    expect((await client.post(`/elementos/${t.id}/mover`, { despuesDe: null })).status).toBe(403);
  });
});
