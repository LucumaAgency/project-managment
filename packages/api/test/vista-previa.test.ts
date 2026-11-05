/** Vista previa de las secciones en la página del proyecto. */
import fs from 'node:fs';
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
let owner: Cliente;
let client: Cliente;
let tokenOwner: string;
let p: string;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('x')]);

async function subir(nombre: string, carpeta: string | null, visible: boolean) {
  const q = new URLSearchParams({ nombre, ...(carpeta ? { carpeta } : {}), ...(visible ? { visible: '1' } : {}) });
  const r = await app.inject({
    method: 'POST',
    url: `/api/v1/proyectos/${p}/archivos?${q}`,
    headers: { cookie: `${COOKIE_SESION}=${tokenOwner}`, 'x-cuenta': A.slug, 'content-type': 'application/octet-stream' },
    payload: PNG,
  });
  return r.json().archivo.id as string;
}

beforeAll(async () => {
  A = await sembrarCuenta('A');
  app = await buildApp({ logger: false, baseDomain: '' });
  tokenOwner = (await crearSesion(A.ownerId)).token;
  owner = cliente(app, tokenOwner, A.slug);
  client = cliente(app, (await crearSesion(A.clientId)).token, A.slug);
  p = (await owner.post('/proyectos', { name: 'Vista previa' })).json.proyecto.id;
  await owner.post(`/proyectos/${p}/personas`, { userId: A.clientId });
  const l1 = (await owner.post(`/proyectos/${p}/listas`, { title: 'Diseño', visibleToClients: true })).json.lista.id;
  const l2 = (await owner.post(`/proyectos/${p}/listas`, { title: 'Interna' })).json.lista.id;
  for (const t of ['Uno', 'Dos', 'Tres', 'Cuatro']) await owner.post(`/listas/${l1}/tareas`, { title: t, visibleToClients: t !== 'Dos' });
  const hecha = (await owner.post(`/listas/${l1}/tareas`, { title: 'Hecha', visibleToClients: true })).json.tarea.id;
  await owner.post(`/tareas/${hecha}/completar`);
  await owner.post(`/listas/${l2}/tareas`, { title: 'Secreta' });
  for (const [title, visibleToClients] of [['Viejo', true], ['Interno', false], ['Nuevo', true]] as const) {
    await owner.post(`/proyectos/${p}/elementos`, { type: 'message', title, visibleToClients, bodyText: `cuerpo de ${title}` });
  }
  const carpeta = (await owner.post(`/proyectos/${p}/elementos`, { type: 'folder', title: 'Borrada', visibleToClients: true })).json.elemento.id;
  await subir('en-borrada.png', carpeta, true);
  await owner.post(`/elementos/${carpeta}/papelera`);
  await subir('interno.png', null, false);
  await subir('logo.png', null, true);
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
  fs.rmSync(env.archivosDir, { recursive: true, force: true });
});

describe('vista previa', () => {
  it('el equipo: primeras listas con sus pendientes, últimos mensajes y archivos vivos', async () => {
    const v = (await owner.get(`/proyectos/${p}`)).json.vistaPrevia;
    expect(v.tareas.pendientes).toBe(5);
    expect(v.tareas.listas.map((l: { title: string }) => l.title)).toEqual(['Diseño', 'Interna']);
    expect(v.tareas.listas[0]).toMatchObject({ total: 5, hechas: 1 });
    expect(v.tareas.listas[0].tareas.map((t: { title: string }) => t.title)).toEqual(['Uno', 'Dos', 'Tres']);
    expect(v.mensajes.map((m: { title: string }) => m.title)).toEqual(['Nuevo', 'Interno', 'Viejo']);
    expect(v.mensajes[0].extracto).toBe('cuerpo de Nuevo');
    expect(v.archivos.map((a: { title: string }) => a.title)).toEqual(['logo.png', 'interno.png']);
    expect(v.archivos[0]).toMatchObject({ tipo: 'image/png' });
  });

  it('el cliente: solo lo visible', async () => {
    const v = (await client.get(`/proyectos/${p}`)).json.vistaPrevia;
    expect(v.tareas.pendientes).toBe(3);
    expect(v.tareas.listas.map((l: { title: string }) => l.title)).toEqual(['Diseño']);
    expect(v.tareas.listas[0].tareas.map((t: { title: string }) => t.title)).toEqual(['Uno', 'Tres', 'Cuatro']);
    expect(v.mensajes.map((m: { title: string }) => m.title)).toEqual(['Nuevo', 'Viejo']);
    expect(v.archivos.map((a: { title: string }) => a.title)).toEqual(['logo.png']);
    expect(JSON.stringify(v)).not.toContain('Secreta');
  });
});

describe('carpetas en la tarjeta de Archivos (D-79)', () => {
  it('cada carpeta con sus primeros elementos; el cliente solo ve lo visible', async () => {
    const carpeta = async (title: string, visibleToClients: boolean) => (await owner.post(`/proyectos/${p}/elementos`, { type: 'folder', title, visibleToClients })).json.elemento.id as string;
    const reportes = await carpeta('Reportes', true);
    await carpeta('Zona interna', false);
    await owner.post(`/proyectos/${p}/enlaces`, { titulo: 'Reporte octubre', url: 'https://example.com/r.pdf', carpeta: reportes, visible: true });
    await subir('borrador-interno.png', reportes, false);
    const sub = (await owner.post(`/proyectos/${p}/elementos`, { type: 'folder', title: 'Anexos', parentId: reportes, visibleToClients: true })).json.elemento.id;
    expect(sub).toBeTruthy();

    const v = (await owner.get(`/proyectos/${p}`)).json.vistaPrevia.carpetas;
    expect(v.total).toBe(2); // la de la papelera no cuenta
    expect(v.lista.map((c: { title: string }) => c.title)).toEqual(['Reportes', 'Zona interna']);
    expect(v.lista[0].total).toBe(3);
    expect(v.lista[0].elementos.map((e: { tipo: string }) => e.tipo)).toEqual(['carpeta', 'archivo', 'enlace']);
    expect(v.lista[1]).toMatchObject({ total: 0, elementos: [] });
    expect(v.sueltos.total).toBe(2);

    const c = (await client.get(`/proyectos/${p}`)).json.vistaPrevia.carpetas;
    expect(c.total).toBe(1);
    expect(c.lista).toHaveLength(1);
    expect(c.lista[0].total).toBe(2);
    expect(c.lista[0].elementos.map((e: { title: string }) => e.title).sort()).toEqual(['Anexos', 'Reporte octubre']);
    expect(c.sueltos.elementos.map((e: { title: string }) => e.title)).toEqual(['logo.png']);
    expect(JSON.stringify(c)).not.toContain('interno');
  });
});
