/** Día 14: la papelera se vacía sola a los 30 días, con los archivos del disco. */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { env } from '../src/env.js';
import { COOKIE_SESION, crearSesion } from '../src/lib/sesion.js';
import { purgarCuenta } from '../src/services/purga.js';
import { cliente, type Cliente } from './http.js';
import { sembrarCuenta, type Semilla } from './semilla.js';

let app: FastifyInstance;
let A: Semilla;
let B: Semilla;
let owner: Cliente;
let tokenOwner: string;
let p: string;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('png de prueba')]);
const DIA = 86_400_000;
const haceDias = (n: number) => new Date(Date.now() - n * DIA);

async function subir(proyecto: string, nombre: string, token = tokenOwner, cuenta = A.slug) {
  const r = await app.inject({
    method: 'POST',
    url: `/api/v1/proyectos/${proyecto}/archivos?nombre=${nombre}`,
    headers: { cookie: `${COOKIE_SESION}=${token}`, 'x-cuenta': cuenta, 'content-type': 'application/octet-stream' },
    payload: PNG,
  });
  return r.json().archivo as { id: string; versiones: { blobId: string }[] };
}
const enDisco = async (blobId: string) => {
  const b = await prismaAdmin.blob.findUnique({ where: { id: blobId } });
  return b ? fs.existsSync(path.join(env.archivosDir, b.storageKey)) : false;
};
/** Manda a la papelera y la "envejece" n días. */
async function aLaPapelera(id: string, dias: number) {
  await owner.post(`/elementos/${id}/papelera`);
  await prismaAdmin.recording.update({ where: { id }, data: { trashedAt: haceDias(dias) } });
}
/** Los blobs recién creados se protegen un día (subida en curso): se envejecen también. */
const envejecerBlobs = () => prismaAdmin.blob.updateMany({ data: { createdAt: haceDias(2) } });

beforeAll(async () => {
  [A, B] = await Promise.all([sembrarCuenta('A'), sembrarCuenta('B')]);
  app = await buildApp({ logger: false, baseDomain: '' });
  tokenOwner = (await crearSesion(A.ownerId)).token;
  owner = cliente(app, tokenOwner, A.slug);
  p = (await owner.post('/proyectos', { name: 'Purga' })).json.proyecto.id;
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
  fs.rmSync(env.archivosDir, { recursive: true, force: true });
});

describe('purga de la papelera', () => {
  it('borra lo que lleva más de 30 días (con lo de adentro) y deja lo reciente', async () => {
    const viejo = (await owner.post(`/proyectos/${p}/elementos`, { type: 'message', title: 'Viejo' })).json.elemento.id;
    const reciente = (await owner.post(`/proyectos/${p}/elementos`, { type: 'message', title: 'Reciente' })).json.elemento.id;
    const activo = (await owner.post(`/proyectos/${p}/elementos`, { type: 'message', title: 'Activo' })).json.elemento.id;
    const lista = (await owner.post(`/proyectos/${p}/elementos`, { type: 'todolist', title: 'Lista' })).json.elemento.id;
    const tarea = (await owner.post(`/listas/${lista}/tareas`, { title: 'Adentro' })).json.tarea.id;
    await owner.post(`/elementos/${tarea}/comentarios`, { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hola' }] }] } });
    await aLaPapelera(viejo, 31);
    await aLaPapelera(reciente, 10);
    await aLaPapelera(lista, 45);

    const r = await purgarCuenta(A.accountId);
    expect(r.elementos).toBe(2);
    const quedan = (await prismaAdmin.recording.findMany({ where: { projectId: p }, select: { id: true } })).map((x) => x.id);
    expect(quedan).toContain(reciente);
    expect(quedan).toContain(activo);
    expect(quedan).not.toContain(viejo);
    expect(quedan).not.toContain(lista);
    expect(quedan).not.toContain(tarea);
    expect(await prismaAdmin.recording.count({ where: { parentId: tarea } })).toBe(0);
    // Queda constancia en el registro de la cuenta.
    expect(await prismaAdmin.auditLog.count({ where: { accountId: A.accountId, action: 'papelera.purga' } })).toBeGreaterThanOrEqual(1);
  });

  it('un archivo purgado se borra del disco con todas sus versiones; el que sigue activo no', async () => {
    const borrado = await subir(p, 'viejo.png');
    const v2 = await app.inject({
      method: 'POST',
      url: `/api/v1/archivos/${borrado.id}/versiones?nombre=viejo2.png`,
      headers: { cookie: `${COOKIE_SESION}=${tokenOwner}`, 'x-cuenta': A.slug, 'content-type': 'application/octet-stream' },
      payload: PNG,
    });
    const blobs = [borrado.versiones[0].blobId, v2.json().archivo.versiones[0].blobId];
    const queda = await subir(p, 'queda.png');
    for (const b of blobs) expect(await enDisco(b)).toBe(true);
    const usadosAntes = (await owner.get(`/proyectos/${p}/archivos`)).json.almacenamiento.usados;
    await aLaPapelera(borrado.id, 31);
    await envejecerBlobs();

    const r = await purgarCuenta(A.accountId);
    expect(r.archivos).toBe(2);
    expect(r.bytes).toBe(PNG.length * 2);
    for (const b of blobs) expect(await prismaAdmin.blob.findUnique({ where: { id: b } })).toBeNull();
    expect(await enDisco(queda.versiones[0].blobId)).toBe(true);
    // El espacio usado vuelve a bajar.
    const usados = (await owner.get(`/proyectos/${p}/archivos`)).json.almacenamiento.usados;
    expect(usadosAntes - usados).toBe(PNG.length * 2);
  });

  it('un proyecto en la papelera hace más de 30 días se borra entero, con sus archivos', async () => {
    const q = (await owner.post('/proyectos', { name: 'Proyecto viejo' })).json.proyecto.id;
    const a = await subir(q, 'del-proyecto.png');
    await owner.post(`/proyectos/${q}/papelera`);
    await prismaAdmin.project.update({ where: { id: q }, data: { trashedAt: haceDias(31) } });
    await envejecerBlobs();
    const ruta = path.join(env.archivosDir, (await prismaAdmin.blob.findUniqueOrThrow({ where: { id: a.versiones[0].blobId } })).storageKey);

    const r = await purgarCuenta(A.accountId);
    expect(r.proyectos).toBe(1);
    expect(await prismaAdmin.project.findUnique({ where: { id: q } })).toBeNull();
    expect(fs.existsSync(ruta)).toBe(false);
  });

  it('solo toca la cuenta que purga, y correrla de nuevo no hace nada', async () => {
    const ownerB = cliente(app, (await crearSesion(B.ownerId)).token, B.slug);
    const pb = (await ownerB.post('/proyectos', { name: 'B' })).json.proyecto.id;
    const m = (await ownerB.post(`/proyectos/${pb}/elementos`, { type: 'message', title: 'De B' })).json.elemento.id;
    await ownerB.post(`/elementos/${m}/papelera`);
    await prismaAdmin.recording.update({ where: { id: m }, data: { trashedAt: haceDias(40) } });

    expect(await purgarCuenta(A.accountId)).toEqual({ proyectos: 0, elementos: 0, archivos: 0, bytes: 0 });
    expect(await prismaAdmin.recording.findUnique({ where: { id: m } })).not.toBeNull();
    expect((await purgarCuenta(B.accountId)).elementos).toBe(1);
  });

  it('un archivo recién subido sin versión todavía (subida en curso) no se toca', async () => {
    const b = await prismaAdmin.blob.create({
      data: { accountId: A.accountId, storageKey: `${A.accountId}/en-curso-${Date.now()}`, filename: 'x', contentType: 'image/png', byteSize: 1n, createdById: A.ownerId },
    });
    await purgarCuenta(A.accountId);
    expect(await prismaAdmin.blob.findUnique({ where: { id: b.id } })).not.toBeNull();
  });
});
