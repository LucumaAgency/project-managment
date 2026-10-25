/** Tablero (D-68): columnas, mover tarjetas, Hecho = completada, revisión del cliente, pasos. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { crearSesion } from '../src/lib/sesion.js';
import { cliente, type Cliente } from './http.js';
import { sembrarCuenta, type Semilla } from './semilla.js';

let app: FastifyInstance;
let A: Semilla;
let owner: Cliente;
let member: Cliente;
let client: Cliente;
let lista: string;
const t: Record<string, string> = {};

const columnaDe = async (c: Cliente, id: string) => (await c.get(`/tareas/${id}`)).json.tarea.tablero?.columna;
const listado = async (c: Cliente) => (await c.get(`/proyectos/${A.projectId}/tareas`)).json.listas.find((l: { id: string }) => l.id === lista);
const mover = (c: Cliente, id: string, columnaId: string) => c.post(`/tareas/${id}/columna`, { columnaId });

beforeAll(async () => {
  A = await sembrarCuenta('A');
  app = await buildApp({ logger: false, baseDomain: '' });
  owner = cliente(app, (await crearSesion(A.ownerId)).token, A.slug);
  member = cliente(app, (await crearSesion(A.memberId)).token, A.slug);
  client = cliente(app, (await crearSesion(A.clientId)).token, A.slug);
  lista = (await owner.post(`/proyectos/${A.projectId}/listas`, { title: 'Contenido de noviembre', visibleToClients: true })).json.lista.id;
  for (const n of ['Post 1', 'Post 2', 'Reel']) {
    t[n] = (await owner.post(`/listas/${lista}/tareas`, { title: n, visibleToClients: true })).json.tarea.id;
  }
  await owner.post(`/tareas/${t['Reel']}/completar`);
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('ver como tablero', () => {
  it('con columnas por defecto; lo completado arranca en Hecho y lo demás en la primera', async () => {
    const r = await owner.post(`/listas/${lista}/tablero`, { enabled: true });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.tablero.columnas.map((c: { nombre: string }) => c.nombre)).toEqual(['Sin empezar', 'En proceso', 'En revisión', 'Hecho']);
    const l = await listado(member);
    expect(l.tablero.enabled).toBe(true);
    expect(Object.fromEntries(l.tareas.map((x: { title: string; columna: string }) => [x.title, x.columna]))).toEqual({ 'Post 1': 'k1', 'Post 2': 'k1', Reel: 'k4' });
  });

  it('el cliente no lo arma ni mueve tarjetas', async () => {
    expect((await client.post(`/listas/${lista}/tablero`, { enabled: false })).status).toBe(403);
    expect((await mover(client, t['Post 1'], 'k2')).status).toBe(403);
  });
});

describe('mover', () => {
  it('entre columnas, con actividad; a Hecho completa y desde Hecho reabre', async () => {
    expect((await mover(member, t['Post 1'], 'k2')).status).toBe(200);
    expect(await prismaAdmin.event.count({ where: { recordingId: t['Post 1'], action: 'column_changed' } })).toBe(1);
    const r = await mover(member, t['Post 1'], 'k4');
    expect(r.json.tarea.completedAt).not.toBeNull();
    const r2 = await mover(member, t['Post 1'], 'k2');
    expect(r2.json.tarea.completedAt).toBeNull();
    expect(r2.json.tarea.tablero.columna).toBe('k2');
  });

  it('completar con la casilla también la pasa a Hecho; reabrir la saca', async () => {
    await member.post(`/tareas/${t['Post 2']}/completar`);
    expect(await columnaDe(member, t['Post 2'])).toBe('k4');
    await member.post(`/tareas/${t['Post 2']}/reabrir`);
    expect(await columnaDe(member, t['Post 2'])).toBe('k1');
  });

  it('una columna que no existe no se acepta', async () => {
    expect((await mover(member, t['Post 1'], 'k99')).status).toBe(400);
  });
});

describe('revisión del cliente', () => {
  it('pasar a revisión le avisa a quien sigue la tarjeta; el cliente aprueba y queda en Hecho', async () => {
    await member.post(`/elementos/${t['Post 1']}/seguir`);
    await prismaAdmin.subscription.create({ data: { accountId: A.accountId, recordingId: t['Post 1'], userId: A.clientId } });
    await mover(member, t['Post 1'], 'k3');
    expect(await prismaAdmin.notification.count({ where: { recordingId: t['Post 1'], userId: A.clientId } })).toBe(1);
    const r = await client.post(`/tareas/${t['Post 1']}/aprobar`);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.tarea).toMatchObject({ completedBy: { id: A.clientId }, tablero: { columna: 'k4' } });
    expect(await prismaAdmin.event.count({ where: { recordingId: t['Post 1'], action: 'approved', actorId: A.clientId } })).toBe(1);
  });

  it('pedir cambios: vuelve a la columna anterior con el comentario', async () => {
    await mover(member, t['Post 2'], 'k3');
    expect((await client.post(`/tareas/${t['Post 2']}/pedir-cambios`, { comentario: '' })).status).toBe(400);
    const r = await client.post(`/tareas/${t['Post 2']}/pedir-cambios`, { comentario: 'El logo más grande' });
    expect(r.status).toBe(200);
    expect(r.json.tarea.tablero.columna).toBe('k2');
    const comentario = await prismaAdmin.recording.findFirstOrThrow({ where: { parentId: t['Post 2'], type: 'comment' } });
    expect(comentario).toMatchObject({ creatorId: A.clientId, bodyText: 'Pidió cambios: El logo más grande' });
  });

  it('fuera de revisión no se aprueba; una tarjeta interna, el cliente ni la ve', async () => {
    expect((await client.post(`/tareas/${t['Post 2']}/aprobar`)).status).toBe(409);
    const interna = (await owner.post(`/listas/${lista}/tareas`, { title: 'Interna' })).json.tarea.id;
    await mover(member, interna, 'k3');
    expect((await client.post(`/tareas/${interna}/aprobar`)).status).toBe(404);
  });
});

describe('columnas', () => {
  it('se editan: renombrar, agregar, quitar (sus tarjetas pasan a la primera); Hecho siempre al final', async () => {
    await mover(member, t['Post 2'], 'k2');
    const r = await owner.put(`/listas/${lista}/columnas`, {
      columnas: [
        { id: 'k4', nombre: 'Publicado', tipo: 'hecho' },
        { id: 'k1', nombre: 'Ideas' },
        { nombre: 'Grabación' },
        { id: 'k3', nombre: 'Aprobación del cliente', tipo: 'revision' },
      ],
    });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.tablero.columnas.map((c: { id: string; nombre: string }) => `${c.id}:${c.nombre}`)).toEqual(['k1:Ideas', 'k5:Grabación', 'k3:Aprobación del cliente', 'k4:Publicado']);
    expect(await columnaDe(member, t['Post 2'])).toBe('k1'); // k2 se quitó
    expect((await owner.put(`/listas/${lista}/columnas`, { columnas: [{ nombre: 'A', tipo: 'revision' }, { nombre: 'B', tipo: 'revision' }] })).status).toBe(400);
    expect((await owner.put(`/listas/${lista}/columnas`, { columnas: [{ nombre: 'Hecho', tipo: 'hecho' }] })).status).toBe(400);
  });

  it('volver a lista guarda las columnas', async () => {
    await owner.post(`/listas/${lista}/tablero`, { enabled: false });
    expect((await listado(member)).tablero).toMatchObject({ enabled: false });
    const r = await owner.post(`/listas/${lista}/tablero`, { enabled: true });
    expect(r.json.tablero.columnas[1].nombre).toBe('Grabación');
  });
});

describe('pasos', () => {
  it('el equipo los define; quien la tiene asignada los marca; el cliente no los cambia', async () => {
    const id = (await owner.post(`/listas/${lista}/tareas`, { title: 'Shoot', visibleToClients: true, assigneeIds: [A.clientId] })).json.tarea.id;
    const r = await member.put(`/tareas/${id}/pasos`, { pasos: [{ texto: 'Guion' }, { texto: 'Locación' }, { texto: 'Vestuario' }] });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const pasos = r.json.tarea.pasos;
    expect(pasos.map((p: { id: string }) => p.id)).toEqual(['p1', 'p2', 'p3']);
    const marcado = await client.put(`/tareas/${id}/pasos`, { pasos: pasos.map((p: { id: string; texto: string }, i: number) => ({ id: p.id, texto: p.texto, hecho: i === 1 })) });
    expect(marcado.status, JSON.stringify(marcado.json)).toBe(200);
    const clienteNombre = (await prismaAdmin.user.findUniqueOrThrow({ where: { id: A.clientId } })).name;
    expect(marcado.json.tarea.pasos[1]).toMatchObject({ hecho: true, por: clienteNombre });
    expect((await client.put(`/tareas/${id}/pasos`, { pasos: [{ texto: 'Otro' }] })).status).toBe(403);
    const l = await listado(member);
    expect(l.tareas.find((x: { id: string }) => x.id === id).pasos).toEqual({ total: 3, hechos: 1 });
  });
});
