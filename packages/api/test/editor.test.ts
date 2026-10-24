/** Día 6: cuerpo con el documento del editor, HTML armado en el servidor y menciones válidas. */
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
let fueraId: string; // del equipo de A, pero no está en el proyecto
let projectId: string;

const mencion = (id: string, label = id) => ({ type: 'mention', attrs: { id, label } });
const doc = (...content: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });
const texto = (text: string) => ({ type: 'text', text });
const mencionadosEn = async (recordingId: string) =>
  (await prismaAdmin.mention.findMany({ where: { recordingId }, select: { userId: true } })).map((m) => m.userId).sort();

beforeAll(async () => {
  [A, B] = await Promise.all([sembrarCuenta('A'), sembrarCuenta('B')]);
  app = await buildApp({ logger: false, baseDomain: '' });
  const fuera = await prismaAdmin.user.create({ data: { email: `fuera-${A.slug}@test.pe`, name: 'Fuera' } });
  fueraId = fuera.id;
  await unirACuenta(fuera.id, A.accountId, 'member');
  owner = cliente(app, (await crearSesion(A.ownerId)).token, A.slug);
  member = cliente(app, (await crearSesion(A.memberId)).token, A.slug);
  projectId = (await owner.post('/proyectos', { name: 'Editor' })).json.proyecto.id;
  for (const userId of [A.memberId, A.clientId]) await owner.post(`/proyectos/${projectId}/personas`, { userId });
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('cuerpo con el editor', () => {
  it('guarda el documento, arma el HTML seguro y el texto, y la búsqueda lo encuentra', async () => {
    const r = await member.post(`/proyectos/${projectId}/elementos`, {
      type: 'message',
      title: 'Brief',
      body: doc(texto('<img src=x onerror=alert(1)> palabraeditor '), { type: 'text', text: 'importante', marks: [{ type: 'bold' }] }),
    });
    expect(r.status).toBe(200);
    expect(r.json.elemento.bodyHtml).toBe('<p>&lt;img src=x onerror=alert(1)&gt; palabraeditor <strong>importante</strong></p>');
    expect(r.json.elemento.bodyText).toBe('<img src=x onerror=alert(1)> palabraeditor importante');
    expect(r.json.elemento.body.type).toBe('doc');

    const hallados = await prismaAdmin.$queryRaw<{ id: string }[]>`
      SELECT id FROM recordings WHERE search @@ plainto_tsquery('simple', 'palabraeditor')`;
    expect(hallados.map((h) => h.id)).toContain(r.json.elemento.id);
  });

  it('un documento con nodos no permitidos se rechaza (400) y no se guarda nada', async () => {
    const antes = await prismaAdmin.recording.count({ where: { projectId } });
    const r = await member.post(`/proyectos/${projectId}/elementos`, {
      type: 'message',
      title: 'X',
      body: { type: 'doc', content: [{ type: 'iframe', attrs: { src: 'https://malo.com' } }] },
    });
    expect(r.status).toBe(400);
    expect(await prismaAdmin.recording.count({ where: { projectId } })).toBe(antes);
  });

  it('el texto plano sigue sirviendo (se convierte a párrafos)', async () => {
    const r = await member.post(`/proyectos/${projectId}/elementos`, { type: 'message', title: 'Plano', bodyText: 'uno\n\ndos' });
    expect(r.json.elemento.bodyHtml).toBe('<p>uno</p><p>dos</p>');
  });

  it('un comentario con el documento vacío es un comentario vacío', async () => {
    const msg = (await member.post(`/proyectos/${projectId}/elementos`, { type: 'message', title: 'M' })).json.elemento.id;
    const r = await member.post(`/proyectos/${projectId}/elementos`, { type: 'comment', parentId: msg, body: { type: 'doc', content: [{ type: 'paragraph' }] } });
    expect(r.status).toBe(400);
  });
});

describe('menciones', () => {
  it('solo quedan las de personas que ven el proyecto; otra cuenta y gente de fuera no', async () => {
    const r = await member.post(`/proyectos/${projectId}/elementos`, {
      type: 'message',
      title: 'Con menciones',
      visibleToClients: true,
      body: doc(mencion(A.ownerId), mencion(A.clientId), mencion(fueraId), mencion(B.memberId), mencion('inventado')),
    });
    expect(r.json.elemento.mencionados.sort()).toEqual([A.ownerId, A.clientId].sort());
    expect(await mencionadosEn(r.json.elemento.id)).toEqual([A.ownerId, A.clientId].sort());
    const ev = await prismaAdmin.event.findFirstOrThrow({ where: { recordingId: r.json.elemento.id, action: 'created' } });
    expect((ev.details as { mencionados: string[] }).mencionados.sort()).toEqual([A.ownerId, A.clientId].sort());
  });

  it('en algo interno, al cliente no se lo menciona (no puede verlo)', async () => {
    const r = await member.post(`/proyectos/${projectId}/elementos`, {
      type: 'message',
      title: 'Interno',
      body: doc(mencion(A.clientId), mencion(A.ownerId)),
    });
    expect(r.json.elemento.mencionados).toEqual([A.ownerId]);
  });

  it('editar el texto reemplaza las menciones; pasar a interno saca al cliente', async () => {
    const id = (await member.post(`/proyectos/${projectId}/elementos`, {
      type: 'message',
      title: 'Cambia',
      visibleToClients: true,
      body: doc(mencion(A.clientId)),
    })).json.elemento.id;
    expect(await mencionadosEn(id)).toEqual([A.clientId]);

    await member.patch(`/elementos/${id}`, { body: doc(mencion(A.ownerId), mencion(A.clientId)) });
    expect(await mencionadosEn(id)).toEqual([A.ownerId, A.clientId].sort());

    await member.patch(`/elementos/${id}`, { visibleToClients: false });
    expect(await mencionadosEn(id)).toEqual([A.ownerId]);

    await member.patch(`/elementos/${id}`, { body: doc(texto('sin nadie')) });
    expect(await mencionadosEn(id)).toEqual([]);
  });

  it('la lista para el @: quienes ven el proyecto; sin clientes si es interno', async () => {
    const todos = (await member.get(`/proyectos/${projectId}/mencionables`)).json.personas.map((p: { userId: string }) => p.userId);
    expect(todos.sort()).toEqual([A.ownerId, A.memberId, A.clientId].sort());
    expect(todos).not.toContain(fueraId);
    const internos = (await member.get(`/proyectos/${projectId}/mencionables?interno=1`)).json.personas.map((p: { userId: string }) => p.userId);
    expect(internos).not.toContain(A.clientId);
  });
});
