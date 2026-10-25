/** Tareas que piden algo (D-65): datos, archivos y enlaces; se completan solas; ficha del cliente. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { env } from '../src/env.js';
import { COOKIE_SESION, crearSesion } from '../src/lib/sesion.js';
import { cliente, type Cliente } from './http.js';
import { sembrarCuenta, type Semilla } from './semilla.js';

let app: FastifyInstance;
let A: Semilla;
let B: Semilla;
let owner: Cliente;
let member: Cliente;
let client: Cliente;
let ownerB: Cliente;
let tokens: Record<'owner' | 'client' | 'ownerB', string>;
let p: string;
let listaVisible: string;
const t: Record<string, string> = {};
const MARCA = 'zzinterno';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('constancia')]);

const DATOS = [
  { etiqueta: 'Razón social', tipo: 'texto' },
  { etiqueta: 'RUC', tipo: 'texto' },
  { etiqueta: 'Comentarios', tipo: 'parrafo', obligatorio: false },
];

async function tarea(lista: string, title: string, datos: object) {
  const r = await owner.post(`/listas/${lista}/tareas`, { title, ...datos });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return r.json.tarea.id as string;
}
const detalle = async (c: Cliente, id: string) => (await c.get(`/tareas/${id}`)).json;
const responder = (c: Cliente, id: string, respuestas: object) => c.put(`/tareas/${id}/respuestas`, { respuestas });
function subir(token: string, slug: string, id: string, campo: string, nombre = 'constancia.png', cuerpo = PNG) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/tareas/${id}/campos/${campo}/archivos?nombre=${encodeURIComponent(nombre)}`,
    headers: { cookie: `${COOKIE_SESION}=${token}`, 'x-cuenta': slug, 'content-type': 'application/octet-stream' },
    payload: cuerpo,
  });
}
const blob = (token: string, slug: string, id: string) =>
  app.inject({ url: `/api/v1/blobs/${id}/contenido`, headers: { cookie: `${COOKIE_SESION}=${token}`, 'x-cuenta': slug } });

beforeAll(async () => {
  [A, B] = await Promise.all([sembrarCuenta('A'), sembrarCuenta('B')]);
  app = await buildApp({ logger: false, baseDomain: '' });
  tokens = { owner: (await crearSesion(A.ownerId)).token, client: (await crearSesion(A.clientId)).token, ownerB: (await crearSesion(B.ownerId)).token };
  owner = cliente(app, tokens.owner, A.slug);
  member = cliente(app, (await crearSesion(A.memberId)).token, A.slug);
  client = cliente(app, tokens.client, A.slug);
  ownerB = cliente(app, tokens.ownerB, B.slug);
  p = A.projectId;
  listaVisible = (await owner.post(`/proyectos/${p}/listas`, { title: 'Onboarding', visibleToClients: true })).json.lista.id;
  const listaInterna = (await owner.post(`/proyectos/${p}/listas`, { title: 'Interna' })).json.lista.id;
  const delCliente = { visibleToClients: true, assigneeIds: [A.clientId] };
  t.datos = await tarea(listaVisible, 'Datos de la empresa', { ...delCliente, campos: DATOS });
  t.deposito = await tarea(listaVisible, 'Constancia del depósito', { ...delCliente, campos: [{ etiqueta: 'Foto o PDF', tipo: 'archivo' }] });
  t.referencias = await tarea(listaVisible, 'Referencias web', { ...delCliente, campos: [{ etiqueta: 'Webs que te gustan', tipo: 'enlaces' }] });
  t.interna = await tarea(listaInterna, `Accesos ${MARCA}`, { campos: [{ etiqueta: `Clave ${MARCA}`, tipo: 'texto' }] });
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
  fs.rmSync(env.archivosDir, { recursive: true, force: true });
});

describe('pedir', () => {
  it('la tarea guarda lo que pide con ids estables; el cliente puede responder pero no cambiarlo', async () => {
    const d = await detalle(client, t.datos);
    expect(d.tarea.campos.map((c: { id: string; etiqueta: string; obligatorio: boolean; respuesta: unknown }) => [c.id, c.etiqueta, c.obligatorio, c.respuesta])).toEqual([
      ['c1', 'Razón social', true, null],
      ['c2', 'RUC', true, null],
      ['c3', 'Comentarios', false, null],
    ]);
    expect(d.permisos).toMatchObject({ responder: true, pedir: false });
    expect((await detalle(owner, t.datos)).permisos).toMatchObject({ responder: true, pedir: true });
    expect((await client.patch(`/tareas/${t.datos}`, { campos: [] })).status).toBe(403);
  });

  it('en la lista se ve cuántas cosas pide y cuántas van respondidas', async () => {
    const listas = (await owner.get(`/proyectos/${p}/tareas`)).json.listas;
    const fila = listas.find((l: { id: string }) => l.id === listaVisible).tareas.find((x: { id: string }) => x.id === t.datos);
    expect(fila).toMatchObject({ pide: 3, respondidos: 0 });
  });

  it('el cliente no crea tareas que pidan cosas; los campos se validan', async () => {
    expect((await client.post(`/listas/${listaVisible}/tareas`, { title: 'x', campos: [{ etiqueta: 'a', tipo: 'texto' }] })).status).toBe(403);
    expect((await owner.post(`/listas/${listaVisible}/tareas`, { title: 'x', campos: [{ etiqueta: '', tipo: 'texto' }] })).status).toBe(400);
    expect((await owner.post(`/listas/${listaVisible}/tareas`, { title: 'x', campos: [{ etiqueta: 'a', tipo: 'clave' }] })).status).toBe(400);
  });
});

describe('responder', () => {
  it('a medias no completa; con todo lo obligatorio, se completa sola y avisa', async () => {
    const r1 = await responder(client, t.datos, { c1: 'Flecha Taxi S.A.C.' });
    expect(r1.status, JSON.stringify(r1.json)).toBe(200);
    expect(r1.json).toMatchObject({ seCompleto: false, tarea: { completedAt: null } });
    const r2 = await responder(client, t.datos, { c2: ' 20601234567 ' });
    expect(r2.json.seCompleto).toBe(true);
    expect(r2.json.tarea.completedBy.id).toBe(A.clientId);
    expect(r2.json.tarea.campos[1].respuesta).toMatchObject({ valor: '20601234567', respondidoPor: { id: A.clientId } });
    expect(await prismaAdmin.event.count({ where: { recordingId: t.datos, action: 'answered', actorId: A.clientId } })).toBe(2);
    // El dueño la creó: la sigue, y le llegó el aviso.
    expect(await prismaAdmin.notification.count({ where: { userId: A.ownerId, recordingId: t.datos } })).toBeGreaterThan(0);
  });

  it('vaciar un campo borra la respuesta (la tarea no se reabre sola)', async () => {
    const r = await responder(owner, t.datos, { c1: '' });
    expect(r.json.tarea.campos[0].respuesta).toBeNull();
    expect(r.json.tarea.completedAt).not.toBeNull();
    await responder(owner, t.datos, { c1: 'Flecha Taxi S.A.C.' });
  });

  it('validaciones: campo que no existe, texto largo, enlace que no es web', async () => {
    expect((await responder(client, t.datos, { c9: 'x' })).status).toBe(400);
    expect((await responder(client, t.datos, { c1: 'x'.repeat(501) })).status).toBe(400);
    expect((await responder(client, t.referencias, { c1: [{ url: 'javascript:alert(1)' }] })).status).toBe(400);
    expect((await responder(client, t.deposito, { c1: [{ blobId: 'inventado' }] })).status).toBe(400);
  });

  it('enlaces: sin https se completa; con nota', async () => {
    const r = await responder(client, t.referencias, { c1: [{ url: 'pura.pe', nota: 'el menú' }, { url: '' }] });
    expect(r.json.tarea.campos[0].respuesta.valor).toEqual([{ url: 'https://pura.pe/', nota: 'el menú' }]);
    expect(r.json.seCompleto).toBe(true);
  });

  it('archivos: subir completa la tarea; el archivo se ve con los permisos de la tarea', async () => {
    const r = await subir(tokens.client, A.slug, t.deposito, 'c1');
    expect(r.statusCode, r.body).toBe(200);
    const d = r.json();
    expect(d.seCompleto).toBe(true);
    const archivo = d.tarea.campos[0].respuesta.valor[0];
    expect(archivo).toMatchObject({ nombre: 'constancia.png', tipo: 'image/png' });
    expect((await blob(tokens.client, A.slug, archivo.blobId)).statusCode).toBe(200);
    expect((await blob(tokens.ownerB, B.slug, archivo.blobId)).statusCode).toBe(404);
    // Quitarlo de la respuesta lo suelta de la tarea (la purga lo borra del disco después).
    await responder(client, t.deposito, { c1: [] });
    expect(await prismaAdmin.recordingAttachment.count({ where: { recordingId: t.deposito } })).toBe(0);
    expect((await blob(tokens.client, A.slug, archivo.blobId)).statusCode).toBe(404);
  });

  it('a un campo que no es de archivos, o a una tarea interna, no se sube', async () => {
    expect((await subir(tokens.client, A.slug, t.datos, 'c1')).statusCode).toBe(404);
    expect((await subir(tokens.client, A.slug, t.interna, 'c1')).statusCode).toBe(404);
    expect((await responder(client, t.interna, { c1: 'x' })).status).toBe(404);
  });
});

describe('cambiar lo que pide', () => {
  it('los campos que quedan conservan su respuesta; los que se quitan la pierden', async () => {
    const antes = (await detalle(owner, t.datos)).tarea.campos;
    const r = await member.patch(`/tareas/${t.datos}`, {
      campos: [antes[1], { etiqueta: 'Teléfono', tipo: 'texto' }, antes[0]],
    });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const despues = (await detalle(owner, t.datos)).tarea.campos;
    expect(despues.map((c: { id: string }) => c.id)).toEqual(['c2', 'c4', 'c1']);
    expect(despues[0].respuesta.valor).toBe('20601234567');
    expect(await prismaAdmin.taskAnswer.count({ where: { recordingId: t.datos, fieldId: 'c3' } })).toBe(0);
    // Cambiar el tipo de un campo borra su respuesta.
    await member.patch(`/tareas/${t.datos}`, { campos: [{ ...despues[0], respuesta: undefined, tipo: 'parrafo' }, despues[1], despues[2]] });
    expect((await detalle(owner, t.datos)).tarea.campos[0].respuesta).toBeNull();
    expect((await detalle(owner, t.datos)).tarea.campos[2].respuesta.valor).toBe('Flecha Taxi S.A.C.');
  });
});

describe('ficha del cliente', () => {
  it('el equipo ve todo lo que se pide; el cliente, solo lo suyo', async () => {
    const eq = (await owner.get(`/proyectos/${p}/ficha`)).json;
    expect(eq.tareas.map((x: { title: string }) => x.title)).toEqual(expect.arrayContaining(['Datos de la empresa', `Accesos ${MARCA}`]));
    const cl = await client.get(`/proyectos/${p}/ficha`);
    expect(cl.status).toBe(200);
    expect(JSON.stringify(cl.json)).not.toContain(MARCA);
    const datos = cl.json.tareas.find((x: { id: string }) => x.id === t.datos);
    expect(datos).toMatchObject({ lista: 'Onboarding', completada: true });
    expect((await ownerB.get(`/proyectos/${p}/ficha`)).status).toBe(404);
    // El proyecto muestra la sección solo si hay tareas que piden algo (contando las que ve cada uno).
    const visibles = cl.json.tareas.length;
    expect((await client.get(`/proyectos/${p}`)).json.secciones.ficha).toBe(visibles);
    expect((await owner.get(`/proyectos/${p}`)).json.secciones.ficha).toBe(eq.tareas.length);
    expect(eq.tareas.length).toBeGreaterThan(visibles);
  });

  it('va en la exportación: ficha.html y sus archivos', async () => {
    await subir(tokens.client, A.slug, t.deposito, 'c1', 'deposito.png');
    const r = await app.inject({ url: '/api/v1/cuenta/exportar', headers: { cookie: `${COOKIE_SESION}=${tokens.owner}`, 'x-cuenta': A.slug } });
    expect(r.statusCode).toBe(200);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-ficha-'));
    const zip = path.join(tmp, 'e.zip');
    fs.writeFileSync(zip, r.rawPayload);
    execFileSync('python3', ['-I', '-m', 'zipfile', '-e', zip, `${zip}.d`]);
    const rutas = (fs.readdirSync(`${zip}.d`, { recursive: true }) as string[]).map((f) => f.split(path.sep).join('/'));
    const ficha = rutas.find((x) => x.endsWith('/ficha.html'))!;
    expect(fs.readFileSync(path.join(`${zip}.d`, ficha), 'utf8')).toContain('Flecha Taxi S.A.C.');
    expect(rutas.some((x) => x.endsWith('ficha/Constancia del depósito/deposito.png'))).toBe(true);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe('plantillas', () => {
  it('lo que pide viaja de la plantilla a la tarea, y de la lista a la plantilla', async () => {
    const pl = await owner.post('/plantillas', {
      name: 'Web',
      items: [{ title: 'Manual de marca', audience: 'client', campos: [{ etiqueta: 'Manual (PDF)', tipo: 'archivo', obligatorio: false }, { etiqueta: 'Colores', tipo: 'texto' }] }],
    });
    expect(pl.json.plantilla.items[0].campos.map((c: { id: string }) => c.id)).toEqual(['c1', 'c2']);
    const ap = await owner.post(`/proyectos/${p}/plantillas`, { plantillaId: pl.json.plantilla.id });
    const lista = (await owner.get(`/proyectos/${p}/tareas`)).json.listas.find((l: { id: string }) => l.id === ap.json.lista.id);
    const d = await detalle(client, lista.tareas[0].id);
    expect(d.tarea.campos.map((c: { etiqueta: string }) => c.etiqueta)).toEqual(['Manual (PDF)', 'Colores']);
    const copia = await owner.post(`/listas/${ap.json.lista.id}/plantilla`, {});
    expect(copia.json.plantilla.items[0].campos.map((c: { etiqueta: string; obligatorio: boolean }) => [c.etiqueta, c.obligatorio])).toEqual([
      ['Manual (PDF)', false],
      ['Colores', true],
    ]);
  });
});
