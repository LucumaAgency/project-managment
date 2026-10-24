/** Día 11: avisos en la bandeja — a quién le llega qué, y lo que nunca debe llegar. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { crearSesion } from '../src/lib/sesion.js';
import { cliente, type Cliente } from './http.js';
import { sembrarCuenta, unirACuenta, type Semilla } from './semilla.js';

let app: FastifyInstance;
let A: Semilla;
let owner: Cliente;
let member: Cliente;
let client: Cliente;
let otro: Cliente;
let otroId: string;
let projectId: string;

const doc = (...content: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });
const texto = (t: string) => ({ type: 'text', text: t });
const mencion = (id: string) => ({ type: 'mention', attrs: { id, label: id } });
const avisosDe = (userId: string) =>
  prismaAdmin.notification.findMany({ where: { userId, accountId: A.accountId }, include: { event: true }, orderBy: { createdAt: 'asc' } });

async function nuevoProyecto() {
  const id = (await owner.post('/proyectos', { name: 'Bandeja' })).json.proyecto.id as string;
  for (const userId of [A.memberId, A.clientId, otroId]) await owner.post(`/proyectos/${id}/personas`, { userId });
  return id;
}
async function tarea(visible: boolean, datos: object = {}, quien: Cliente = member) {
  const l = (await quien.post(`/proyectos/${projectId}/listas`, { title: 'L', visibleToClients: visible })).json.lista.id;
  return (await quien.post(`/listas/${l}/tareas`, { title: 'T', visibleToClients: visible, ...datos })).json.tarea.id as string;
}

beforeAll(async () => {
  A = await sembrarCuenta('A');
  app = await buildApp({ logger: false, baseDomain: '' });
  const u = await prismaAdmin.user.create({ data: { email: `otro-${A.slug}@test.pe`, name: 'Otro' } });
  otroId = u.id;
  await unirACuenta(otroId, A.accountId, 'member');
  const s = async (id: string) => cliente(app, (await crearSesion(id)).token, A.slug);
  [owner, member, client, otro] = await Promise.all([s(A.ownerId), s(A.memberId), s(A.clientId), s(otroId)]);
  projectId = await nuevoProyecto();
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('a quién le llega qué', () => {
  it('mención en un comentario: aviso "mentioned" que abre la tarea; quien escribe no recibe nada', async () => {
    const t = await tarea(false);
    const antesMember = (await avisosDe(A.memberId)).length;
    await member.post(`/elementos/${t}/comentarios`, { body: doc(texto('mira '), mencion(otroId)) });
    const de = await avisosDe(otroId);
    expect(de.at(-1)).toMatchObject({ reason: 'mentioned', recordingId: t });
    expect((await avisosDe(A.memberId)).length).toBe(antesMember);
  });

  it('comentario: avisa a quienes siguen; el mencionado recibe uno solo (mención gana)', async () => {
    const t = await tarea(false); // la sigue member (la creó)
    await otro.post(`/elementos/${t}/comentarios`, { body: doc(texto('primero')) }); // otro pasa a seguirla
    const antesOtro = (await avisosDe(otroId)).length;
    await member.post(`/elementos/${t}/comentarios`, { body: doc(texto('hola '), mencion(otroId)) });
    const nuevosOtro = (await avisosDe(otroId)).slice(antesOtro);
    expect(nuevosOtro.map((n) => n.reason)).toEqual(['mentioned']);
    // Y member, que sigue la tarea, recibió el comentario de otro como "subscribed".
    const deMember = await avisosDe(A.memberId);
    expect(deMember.some((n) => n.recordingId === t && n.reason === 'subscribed')).toBe(true);
  });

  it('asignar avisa al asignado; asignarse a uno mismo no', async () => {
    const t = await tarea(false, { assigneeIds: [otroId, A.memberId] });
    expect((await avisosDe(otroId)).some((n) => n.recordingId === t && n.reason === 'assigned')).toBe(true);
    expect((await avisosDe(A.memberId)).some((n) => n.recordingId === t && n.reason === 'assigned')).toBe(false);
  });

  it('completar avisa a quienes siguen la tarea', async () => {
    const t = await tarea(false); // la sigue member
    await otro.post(`/tareas/${t}/completar`);
    const n = (await avisosDe(A.memberId)).filter((x) => x.recordingId === t);
    expect(n.at(-1)?.event?.action).toBe('completed');
  });

  it('mensaje nuevo: avisa a la gente del proyecto; al cliente solo si es visible', async () => {
    const interno = (await member.post(`/proyectos/${projectId}/elementos`, { type: 'message', title: 'Interno' })).json.elemento.id;
    const visible = (await member.post(`/proyectos/${projectId}/elementos`, { type: 'message', title: 'Público', visibleToClients: true })).json.elemento.id;
    const deOtro = (await avisosDe(otroId)).map((n) => n.recordingId);
    const delCliente = (await avisosDe(A.clientId)).map((n) => n.recordingId);
    expect(deOtro).toEqual(expect.arrayContaining([interno, visible]));
    expect(delCliente).toContain(visible);
    expect(delCliente).not.toContain(interno);
  });

  it('editar y agregar una mención avisa solo al nuevo mencionado', async () => {
    const m = (await member.post(`/proyectos/${projectId}/elementos`, { type: 'message', title: 'Edición', body: doc(mencion(otroId)) })).json.elemento.id;
    const antesOtro = (await avisosDe(otroId)).length;
    const antesOwner = (await avisosDe(A.ownerId)).length;
    await member.patch(`/elementos/${m}`, { body: doc(mencion(otroId), mencion(A.ownerId)) });
    expect((await avisosDe(otroId)).length).toBe(antesOtro);
    expect((await avisosDe(A.ownerId)).slice(antesOwner).map((n) => n.reason)).toEqual(['mentioned']);
  });

  it('una persona desactivada no recibe avisos', async () => {
    const C = await sembrarCuenta('C');
    const dueño = cliente(app, (await crearSesion(C.ownerId)).token, C.slug);
    const p = (await dueño.post('/proyectos', { name: 'X' })).json.proyecto.id;
    await dueño.post(`/proyectos/${p}/personas`, { userId: C.memberId });
    await prismaAdmin.membership.update({ where: { accountId_userId: { accountId: C.accountId, userId: C.memberId } }, data: { status: 'disabled' } });
    const antes = await prismaAdmin.notification.count({ where: { userId: C.memberId, accountId: C.accountId } }); // la semilla trae uno
    await dueño.post(`/proyectos/${p}/elementos`, { type: 'message', title: 'Hola' });
    expect(await prismaAdmin.notification.count({ where: { userId: C.memberId, accountId: C.accountId } })).toBe(antes);
  });
});

describe('el cliente nunca se entera de lo interno', () => {
  it('si lo que sigue pasa a interno: no recibe los comentarios nuevos y el aviso viejo desaparece de su bandeja', async () => {
    const t = await tarea(true);
    await client.post(`/elementos/${t}/comentarios`, { body: doc(texto('lo sigo')) });
    await member.post(`/elementos/${t}/comentarios`, { body: doc(texto('respuesta')) });
    let enBandeja = (await client.get('/bandeja')).json.avisos.map((a: { abre: string }) => a.abre);
    expect(enBandeja).toContain(t);

    await member.patch(`/tareas/${t}`, { visibleToClients: false });
    const antes = (await avisosDe(A.clientId)).length;
    await member.post(`/elementos/${t}/comentarios`, { body: doc(texto('ahora es interno')) });
    expect((await avisosDe(A.clientId)).length).toBe(antes);
    enBandeja = (await client.get('/bandeja')).json.avisos.map((a: { abre: string }) => a.abre);
    expect(enBandeja).not.toContain(t);
  });
});

describe('la bandeja', () => {
  it('lista con frase y proyecto; contador; leer uno, leer al abrir y leer todo', async () => {
    const P = await nuevoProyecto();
    projectId = P;
    await owner.post('/bandeja/leer-todo');
    const t = await tarea(false, { assigneeIds: [A.ownerId] });
    await member.post(`/elementos/${t}/comentarios`, { body: doc(mencion(A.ownerId)) });

    const r = (await owner.get('/bandeja')).json;
    const [primero] = r.avisos;
    expect(primero).toMatchObject({ reason: 'mentioned', leido: false, abre: t, proyecto: { id: P, name: 'Bandeja' } });
    expect(primero.evento).toMatchObject({ action: 'created', elemento: { type: 'comment', padre: { id: t } } });
    expect((await owner.get('/bandeja/contador')).json.noLeidos).toBeGreaterThanOrEqual(2);

    expect((await owner.post(`/bandeja/${primero.id}/leido`)).json.marcados).toBe(1);
    const alAbrir = (await owner.post('/bandeja/leer', { recordingId: t })).json;
    expect(alAbrir.marcados).toBeGreaterThanOrEqual(1);
    expect((await owner.get('/bandeja?no-leidos=1')).json.avisos.filter((a: { abre: string }) => a.abre === t)).toEqual([]);
    await owner.post('/bandeja/leer-todo');
    expect((await owner.get('/bandeja/contador')).json.noLeidos).toBe(0);
  });

  it('nadie ve ni marca la bandeja de otra persona de la misma cuenta', async () => {
    const t = await tarea(false, { assigneeIds: [otroId] });
    const deOtro = (await otro.get('/bandeja')).json.avisos.find((a: { abre: string }) => a.abre === t);
    expect(deOtro).toBeTruthy();
    const deMember = (await member.get('/bandeja')).json.avisos.map((a: { id: string }) => a.id);
    expect(deMember).not.toContain(deOtro.id);
    expect((await member.post(`/bandeja/${deOtro.id}/leido`)).status).toBe(404);
    expect((await prismaAdmin.notification.findUniqueOrThrow({ where: { id: deOtro.id } })).readAt).toBeNull();
  });

  it('otra cuenta: la bandeja es por cuenta', async () => {
    const B = await sembrarCuenta('B');
    await unirACuenta(otroId, B.accountId, 'member');
    const otroEnB = cliente(app, (await crearSesion(otroId)).token, B.slug);
    const ids = (await otroEnB.get('/bandeja')).json.avisos.map((a: { proyecto: { id: string } }) => a.proyecto.id);
    expect(ids).not.toContain(projectId);
  });
});
