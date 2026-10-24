/** Día 8: comentarios en todo, menciones dentro de comentarios y quién sigue cada cosa. */
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
let otro: Cliente;
let otroId: string;
let projectId: string;

const doc = (...content: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });
const texto = (text: string) => ({ type: 'text', text });
const mencion = (id: string) => ({ type: 'mention', attrs: { id, label: id } });
const seguidoresDe = async (recordingId: string) =>
  (await prismaAdmin.subscription.findMany({ where: { recordingId }, select: { userId: true } })).map((s) => s.userId).sort();

async function tarea(visible: boolean, datos: object = {}) {
  const l = (await member.post(`/proyectos/${projectId}/listas`, { title: 'L', visibleToClients: visible })).json.lista.id;
  return (await member.post(`/listas/${l}/tareas`, { title: 'T', visibleToClients: visible, ...datos })).json.tarea.id as string;
}

beforeAll(async () => {
  [A, B] = await Promise.all([sembrarCuenta('A'), sembrarCuenta('B')]);
  app = await buildApp({ logger: false, baseDomain: '' });
  const u = await prismaAdmin.user.create({ data: { email: `otro-${A.slug}@test.pe`, name: 'Otro' } });
  otroId = u.id;
  await unirACuenta(otroId, A.accountId, 'member');
  const sesion = async (id: string, s: Semilla = A) => cliente(app, (await crearSesion(id)).token, s.slug);
  [owner, member, client, otro] = await Promise.all([sesion(A.ownerId), sesion(A.memberId), sesion(A.clientId), sesion(otroId)]);
  projectId = (await owner.post('/proyectos', { name: 'Comentarios' })).json.proyecto.id;
  for (const userId of [A.memberId, A.clientId, otroId]) await owner.post(`/proyectos/${projectId}/personas`, { userId });
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('comentarios', () => {
  it('comentar una tarea: HTML seguro, en orden, con el contador en la lista de tareas', async () => {
    const t = await tarea(false);
    const c1 = await member.post(`/elementos/${t}/comentarios`, { body: doc(texto('primero <b>x</b>')) });
    expect(c1.status).toBe(200);
    expect(c1.json.comentario.bodyHtml).toBe('<p>primero &lt;b&gt;x&lt;/b&gt;</p>');
    await otro.post(`/elementos/${t}/comentarios`, { body: doc(texto('segundo')) });

    const r = (await member.get(`/elementos/${t}/comentarios`)).json;
    expect(r.comentarios.map((c: { bodyHtml: string }) => c.bodyHtml)).toEqual(['<p>primero &lt;b&gt;x&lt;/b&gt;</p>', '<p>segundo</p>']);
    expect(r.puedeComentar).toBe(true);
    expect(r.comentarios[0].permisos).toEqual({ editar: true, papelera: true });
    expect(r.comentarios[1].permisos).toEqual({ editar: false, papelera: false });
    expect(r.comentarios[1].body).toBeUndefined(); // el documento solo viaja para el propio

    const tareas = (await member.get(`/proyectos/${projectId}/tareas`)).json.listas.flatMap((l: { tareas: object[] }) => l.tareas);
    expect(tareas.find((x: { id: string }) => x.id === t).comentarios).toBe(2);
  });

  it('editar el propio; el dueño puede borrar el de otro; borrado ya no aparece', async () => {
    const t = await tarea(false);
    const c = (await otro.post(`/elementos/${t}/comentarios`, { body: doc(texto('v1')) })).json.comentario.id;
    expect((await member.patch(`/elementos/${c}`, { body: doc(texto('hack')) })).status).toBe(403);
    expect((await otro.patch(`/elementos/${c}`, { body: doc(texto('v2')) })).json.elemento.bodyHtml).toBe('<p>v2</p>');
    expect((await owner.post(`/elementos/${c}/papelera`)).status).toBe(200);
    expect((await member.get(`/elementos/${t}/comentarios`)).json.comentarios).toEqual([]);
  });

  it('no se comenta un comentario, ni algo en la papelera, ni algo de otra cuenta', async () => {
    const t = await tarea(false);
    const c = (await member.post(`/elementos/${t}/comentarios`, { body: doc(texto('x')) })).json.comentario.id;
    expect((await member.post(`/elementos/${c}/comentarios`, { body: doc(texto('y')) })).status).toBe(400);
    await member.post(`/elementos/${t}/papelera`);
    // Quien la creó la sigue viendo (para restaurarla), pero no se comenta: 409.
    expect((await member.post(`/elementos/${t}/comentarios`, { body: doc(texto('y')) })).status).toBe(409);
    expect((await otro.post(`/elementos/${t}/comentarios`, { body: doc(texto('y')) })).status).toBe(404);
    const ownerB = cliente(app, (await crearSesion(B.ownerId)).token, B.slug);
    expect((await ownerB.post(`/elementos/${B.todoId}/comentarios`, { body: doc(texto('ok')) })).status).toBe(200);
    expect((await owner.post(`/elementos/${B.todoId}/comentarios`, { body: doc(texto('intruso')) })).status).toBe(404);
  });

  it('comentario vacío: 400', async () => {
    const t = await tarea(false);
    expect((await member.post(`/elementos/${t}/comentarios`, { body: { type: 'doc', content: [{ type: 'paragraph' }] } })).status).toBe(400);
  });
});

describe('el cliente y los comentarios', () => {
  it('en algo visible comenta y ve todo; en algo interno no ve nada', async () => {
    const visible = await tarea(true);
    const interna = await tarea(false);
    await member.post(`/elementos/${visible}/comentarios`, { body: doc(texto('para el cliente')) });
    await member.post(`/elementos/${interna}/comentarios`, { body: doc(texto('solo equipo')) });

    const r = (await client.get(`/elementos/${visible}/comentarios`)).json;
    expect(r.comentarios).toHaveLength(1);
    expect(r.puedeComentar).toBe(true);
    const suyo = await client.post(`/elementos/${visible}/comentarios`, { body: doc(texto('gracias')) });
    expect(suyo.json.comentario.visibleToClients).toBe(true);

    expect((await client.get(`/elementos/${interna}/comentarios`)).status).toBe(404);
    expect((await client.post(`/elementos/${interna}/comentarios`, { body: doc(texto('x')) })).status).toBe(404);
  });
});

describe('seguir', () => {
  it('siguen solos: quien crea, quien comenta, a quien mencionan y a quien asignan', async () => {
    const t = await tarea(true, { assigneeIds: [otroId] });
    expect(await seguidoresDe(t)).toEqual([A.memberId, otroId].sort()); // creó y asignada

    await client.post(`/elementos/${t}/comentarios`, { body: doc(texto('hola '), mencion(A.ownerId)) });
    expect(await seguidoresDe(t)).toEqual([A.memberId, otroId, A.clientId, A.ownerId].sort());
    // El comentario no tiene seguidores propios: se sigue lo comentado.
    const c = (await member.get(`/elementos/${t}/comentarios`)).json.comentarios[0].id;
    expect(await seguidoresDe(c)).toEqual([]);
  });

  it('en algo interno, un cliente mencionado no pasa a seguirlo', async () => {
    const t = await tarea(false);
    await member.post(`/elementos/${t}/comentarios`, { body: doc(mencion(A.clientId), mencion(otroId)) });
    expect(await seguidoresDe(t)).toEqual([A.memberId, otroId].sort());
  });

  it('seguir y dejar de seguir a mano; la respuesta trae la lista', async () => {
    const t = await tarea(false);
    const no = await member.post(`/elementos/${t}/dejar-de-seguir`);
    expect(no.json).toEqual({ siguiendo: false, seguidores: [] });
    const si = await otro.post(`/elementos/${t}/seguir`);
    expect(si.json.seguidores).toEqual([{ userId: otroId, name: 'Otro' }]);
    expect((await member.get(`/elementos/${t}/comentarios`)).json.siguiendo).toBe(false);
    // Volver a comentar vuelve a sumar.
    await member.post(`/elementos/${t}/comentarios`, { body: doc(texto('vuelvo')) });
    expect(await seguidoresDe(t)).toEqual([A.memberId, otroId].sort());
  });

  it('el cliente no puede seguir algo interno', async () => {
    const t = await tarea(false);
    expect((await client.post(`/elementos/${t}/seguir`)).status).toBe(404);
  });
});
