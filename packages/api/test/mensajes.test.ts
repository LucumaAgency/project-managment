/** Día 9: mensajes y actividad del proyecto, y lo que de eso ve un cliente. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { crearSesion } from '../src/lib/sesion.js';
import { cliente, type Cliente } from './http.js';
import { sembrarCuenta, type Semilla } from './semilla.js';

let app: FastifyInstance;
let A: Semilla;
let B: Semilla;
let owner: Cliente;
let member: Cliente;
let client: Cliente;

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
async function proyecto() {
  const id = (await owner.post('/proyectos', { name: 'Mensajes' })).json.proyecto.id as string;
  for (const userId of [A.memberId, A.clientId]) await owner.post(`/proyectos/${id}/personas`, { userId });
  return id;
}
const publicar = async (p: string, title: string, visible = false, quien: Cliente = member) =>
  (await quien.post(`/proyectos/${p}/elementos`, { type: 'message', title, body: doc(`cuerpo de ${title}`), visibleToClients: visible })).json.elemento.id as string;

beforeAll(async () => {
  [A, B] = await Promise.all([sembrarCuenta('A'), sembrarCuenta('B')]);
  app = await buildApp({ logger: false, baseDomain: '' });
  const s = async (id: string) => cliente(app, (await crearSesion(id)).token, A.slug);
  [owner, member, client] = await Promise.all([s(A.ownerId), s(A.memberId), s(A.clientId)]);
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('mensajes', () => {
  it('listado con extracto y comentarios; un comentario nuevo sube el mensaje', async () => {
    const p = await proyecto();
    const viejo = await publicar(p, 'Brief');
    const nuevo = await publicar(p, 'Cronograma');
    let r = (await member.get(`/proyectos/${p}/mensajes`)).json;
    expect(r.mensajes.map((m: { id: string }) => m.id)).toEqual([nuevo, viejo]);
    expect(r.mensajes[1]).toMatchObject({ title: 'Brief', extracto: 'cuerpo de Brief', comentarios: 0 });
    expect(r.puedePublicar).toBe(true);

    await member.post(`/elementos/${viejo}/comentarios`, { body: doc('¿lo revisamos?') });
    r = (await member.get(`/proyectos/${p}/mensajes`)).json;
    expect(r.mensajes.map((m: { id: string }) => m.id)).toEqual([viejo, nuevo]);
    expect(r.mensajes[0].comentarios).toBe(1);
  });

  it('el cliente ve solo los visibles (y los que publica él, que nacen visibles)', async () => {
    const p = await proyecto();
    const interno = await publicar(p, 'Interno');
    const visible = await publicar(p, 'Para el cliente', true);
    const suyo = await publicar(p, 'Pregunta del cliente', false, client);
    const r = (await client.get(`/proyectos/${p}/mensajes`)).json;
    expect(r.mensajes.map((m: { id: string }) => m.id).sort()).toEqual([visible, suyo].sort());
    expect(r.mensajes.map((m: { id: string }) => m.id)).not.toContain(interno);
    expect((await client.get(`/elementos/${interno}`)).status).toBe(404);
  });

  it('otra cuenta no ve los mensajes (404)', async () => {
    const p = await proyecto();
    const ownerB = cliente(app, (await crearSesion(B.ownerId)).token, B.slug);
    expect((await ownerB.get(`/proyectos/${p}/mensajes`)).status).toBe(404);
  });
});

describe('actividad', () => {
  it('lo que pasó, del más nuevo al más viejo, con nombres y con lo comentado', async () => {
    const p = await proyecto();
    const msg = await publicar(p, 'Brief');
    await member.post(`/elementos/${msg}/comentarios`, { body: doc('primer comentario') });
    const lista = (await member.post(`/proyectos/${p}/listas`, { title: 'Diseño' })).json.lista.id;
    const t = (await member.post(`/listas/${lista}/tareas`, { title: 'Logo', assigneeIds: [A.memberId] })).json.tarea.id;
    await member.post(`/tareas/${t}/completar`);

    const e = (await member.get(`/proyectos/${p}/actividad`)).json.eventos;
    const resumen = e.map((x: { action: string; elemento: { type: string; title: string | null } | null }) => `${x.action}:${x.elemento?.type ?? 'proyecto'}`);
    expect(resumen.slice(0, 6)).toEqual(['completed:todo', 'assigned:todo', 'created:todo', 'created:todolist', 'created:comment', 'created:message']);
    const asignado = e.find((x: { action: string }) => x.action === 'assigned');
    expect(asignado.detalles.personas).toEqual(['member A']);
    const comentario = e.find((x: { elemento: { type: string } | null }) => x.elemento?.type === 'comment');
    expect(comentario.elemento).toMatchObject({ extracto: 'primer comentario', padre: { id: msg, type: 'message', title: 'Brief' } });
    expect(e.at(-1)).toMatchObject({ action: 'created', elemento: null }); // el proyecto
    expect(e.find((x: { action: string }) => x.action === 'member_added').detalles.personas).toHaveLength(1);
  });

  it('pagina de a N con ?antes=', async () => {
    const p = await proyecto();
    for (let i = 0; i < 5; i++) await publicar(p, `M${i}`);
    const r1 = (await member.get(`/proyectos/${p}/actividad?limite=3`)).json;
    expect(r1.eventos).toHaveLength(3);
    expect(r1.siguiente).toBeTruthy();
    const r2 = (await member.get(`/proyectos/${p}/actividad?limite=3&antes=${encodeURIComponent(r1.siguiente)}`)).json;
    const vistos = [...r1.eventos, ...r2.eventos].map((x: { id: string }) => x.id);
    expect(new Set(vistos).size).toBe(vistos.length); // sin repetidos
  });

  it('el cliente ve solo lo visible hoy: si algo pasa a interno, su historial se oculta', async () => {
    const p = await proyecto();
    const interno = await publicar(p, 'Interno');
    const visible = await publicar(p, 'Público', true);
    const ids = async () => (await client.get(`/proyectos/${p}/actividad`)).json.eventos.map((x: { elemento: { id: string } | null }) => x.elemento?.id);

    let vistos = await ids();
    expect(vistos).toContain(visible);
    expect(vistos).not.toContain(interno);
    expect(vistos).not.toContain(undefined); // sin eventos del proyecto (sumar personas, etc.)

    await member.patch(`/elementos/${visible}`, { visibleToClients: false });
    vistos = await ids();
    expect(vistos).not.toContain(visible);
  });

  it('lo que está en la papelera: el equipo lo ve sin enlace; el cliente, no', async () => {
    const p = await proyecto();
    const m = await publicar(p, 'Se borra', true);
    await member.post(`/elementos/${m}/papelera`);
    const equipo = (await member.get(`/proyectos/${p}/actividad`)).json.eventos;
    expect(equipo[0]).toMatchObject({ action: 'trashed', elemento: { id: m, activo: false } });
    const delCliente = (await client.get(`/proyectos/${p}/actividad`)).json.eventos.map((x: { elemento: { id: string } }) => x.elemento.id);
    expect(delCliente).not.toContain(m);
  });
});
