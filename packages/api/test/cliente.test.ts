/**
 * Día 13: auditoría de fugas hacia el cliente.
 *
 * Se arma un proyecto con un poco de todo: lo interno lleva la marca SECRETO en el título o el
 * texto; lo visible, VISIBLE. Después el cliente recorre TODAS las rutas que puede usar y en
 * ninguna respuesta puede aparecer la marca. Si alguien agrega una ruta o un campo que filtra
 * algo interno, este test lo debería atrapar (y la ruta nueva se suma a la lista de abajo).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { env } from '../src/env.js';
import { COOKIE_SESION, crearSesion } from '../src/lib/sesion.js';
import { cliente, type Cliente } from './http.js';
import { sembrarCuenta, type Semilla } from './semilla.js';
import fs from 'node:fs';

const MARCA = 'SECRETO';
let app: FastifyInstance;
let A: Semilla;
let member: Cliente;
let client: Cliente;
let tokenCliente: string;
let p: string; // proyecto
const ids: Record<string, string> = {};

const doc = (...content: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });
const texto = (t: string) => ({ type: 'text', text: t });
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('x')]);

async function subir(nombre: string, carpeta: string | null, visible: boolean) {
  const q = new URLSearchParams({ nombre, ...(carpeta ? { carpeta } : {}), ...(visible ? { visible: '1' } : {}) });
  const tokenMember = (await crearSesion(A.memberId)).token;
  const r = await app.inject({
    method: 'POST',
    url: `/api/v1/proyectos/${p}/archivos?${q}`,
    headers: { cookie: `${COOKIE_SESION}=${tokenMember}`, 'x-cuenta': A.slug, 'content-type': 'application/octet-stream' },
    payload: PNG,
  });
  return r.json().archivo as { id: string; versiones: { blobId: string }[] };
}

beforeAll(async () => {
  A = await sembrarCuenta('A');
  app = await buildApp({ logger: false, baseDomain: '' });
  const owner = cliente(app, (await crearSesion(A.ownerId)).token, A.slug);
  member = cliente(app, (await crearSesion(A.memberId)).token, A.slug);
  tokenCliente = (await crearSesion(A.clientId)).token;
  client = cliente(app, tokenCliente, A.slug);
  p = (await owner.post('/proyectos', { name: 'Auditoría' })).json.proyecto.id;
  for (const userId of [A.memberId, A.clientId]) await owner.post(`/proyectos/${p}/personas`, { userId });

  const nuevo = async (datos: object) => (await member.post(`/proyectos/${p}/elementos`, datos)).json.elemento.id as string;
  const tarea = async (lista: string, title: string, visible: boolean) =>
    (await member.post(`/listas/${lista}/tareas`, { title, visibleToClients: visible, dueOn: '2030-01-01' })).json.tarea.id as string;
  const comentar = (id: string, t: string) => member.post(`/elementos/${id}/comentarios`, { body: doc(texto(t)) });

  // Tareas: lista interna con una tarea "visible" adentro (la cadena manda) y lista visible
  // con una tarea interna y una visible.
  ids.listaInterna = await nuevo({ type: 'todolist', title: `Lista ${MARCA}` });
  ids.tareaEnListaInterna = await tarea(ids.listaInterna, `Tarea ${MARCA} en lista interna`, true);
  ids.listaVisible = await nuevo({ type: 'todolist', title: 'Lista VISIBLE', visibleToClients: true });
  ids.tareaInterna = await tarea(ids.listaVisible, `Tarea ${MARCA}`, false);
  ids.tareaVisible = await tarea(ids.listaVisible, 'Tarea VISIBLE', true);
  await comentar(ids.tareaInterna, `comentario ${MARCA}`);
  await comentar(ids.tareaVisible, 'comentario VISIBLE');
  await member.post(`/tareas/${ids.tareaInterna}/completar`);

  // Mensajes.
  ids.msgInterno = await nuevo({ type: 'message', title: `Mensaje ${MARCA}`, body: doc(texto(`cuerpo ${MARCA}`)) });
  await comentar(ids.msgInterno, `respuesta ${MARCA}`);
  ids.msgVisible = await nuevo({ type: 'message', title: 'Mensaje VISIBLE', visibleToClients: true, body: doc(texto('cuerpo VISIBLE')) });

  // Archivos.
  ids.carpetaInterna = await nuevo({ type: 'folder', title: `Carpeta ${MARCA}` });
  const enInterna = await subir(`plano-${MARCA}.png`, ids.carpetaInterna, true);
  ids.archivoEnCarpetaInterna = enInterna.id;
  ids.blobInterno = enInterna.versiones[0].blobId;
  ids.carpetaVisible = await nuevo({ type: 'folder', title: 'Carpeta VISIBLE', visibleToClients: true });
  const internoEnVisible = await subir(`borrador-${MARCA}.png`, ids.carpetaVisible, false);
  ids.archivoInterno = internoEnVisible.id;
  ids.blobInterno2 = internoEnVisible.versiones[0].blobId;
  ids.archivoVisible = (await subir('entrega-VISIBLE.png', ids.carpetaVisible, true)).id;

  // Algo que fue visible y pasó a interno (su historial también tiene que desaparecer).
  ids.exVisible = await nuevo({ type: 'message', title: `Ex visible ${MARCA}`, visibleToClients: true });
  await member.patch(`/elementos/${ids.exVisible}`, { visibleToClients: false });

  // Una plantilla agregada al proyecto: su tarea interna no le llega al cliente (D-64).
  ids.plantilla = (
    await owner.post('/plantillas', {
      name: 'Plantilla VISIBLE',
      items: [
        { title: `Paso ${MARCA}`, notes: `nota ${MARCA}`, audience: 'team', dayOffset: 1 },
        { title: 'Paso VISIBLE', notes: 'nota VISIBLE', audience: 'client', dayOffset: 2 },
      ],
    })
  ).json.plantilla.id;
  ids.listaDePlantilla = (await owner.post(`/proyectos/${p}/plantillas`, { plantillaId: ids.plantilla, responsableId: A.memberId })).json.lista.id;

  // Cosas del equipo que mencionan / asignan, para que existan avisos internos.
  await member.post(`/elementos/${ids.msgInterno}/comentarios`, { body: doc(texto(`otra ${MARCA}`)) });
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
  fs.rmSync(env.archivosDir, { recursive: true, force: true });
});

describe('ninguna ruta del cliente muestra lo interno', () => {
  it('recorriendo todo lo que el cliente puede pedir, la marca no aparece nunca', async () => {
    const rutas = [
      '/proyectos',
      `/proyectos/${p}`,
      `/proyectos/${p}/tareas`,
      `/proyectos/${p}/elementos`,
      `/proyectos/${p}/elementos?padre=${ids.listaVisible}`,
      `/proyectos/${p}/elementos?padre=${ids.listaDePlantilla}`,
      `/proyectos/${p}/mensajes`,
      `/proyectos/${p}/actividad?limite=100`,
      `/proyectos/${p}/archivos`,
      `/proyectos/${p}/archivos?carpeta=${ids.carpetaVisible}`,
      `/proyectos/${p}/mencionables`,
      `/elementos/${ids.listaVisible}`,
      `/elementos/${ids.tareaVisible}`,
      `/elementos/${ids.tareaVisible}/comentarios`,
      `/tareas/${ids.tareaVisible}`,
      `/elementos/${ids.msgVisible}`,
      `/elementos/${ids.msgVisible}/comentarios`,
      `/archivos/${ids.archivoVisible}`,
      `/elementos/${ids.archivoVisible}/comentarios`,
      '/bandeja',
      '/bandeja/contador',
      '/yo',
      `/buscar?q=${MARCA}`,
      '/buscar?q=lista',
      '/buscar?q=tarea',
      '/buscar?q=mensaje',
      '/buscar?q=comentario',
      '/buscar?q=png',
      '/buscar?q=carpeta',
    ];
    const fugas: string[] = [];
    for (const r of rutas) {
      const res = await client.get(r);
      expect({ ruta: r, status: res.status }).toEqual({ ruta: r, status: 200 });
      if (JSON.stringify(res.json).includes(MARCA)) fugas.push(r);
    }
    expect(fugas).toEqual([]);
  });

  it('lo interno, pedido directo por id, da 404 (no 403: no confirma que existe)', async () => {
    const directas = [
      `/elementos/${ids.listaInterna}`,
      `/elementos/${ids.tareaEnListaInterna}`,
      `/tareas/${ids.tareaEnListaInterna}`,
      `/elementos/${ids.tareaInterna}`,
      `/tareas/${ids.tareaInterna}`,
      `/elementos/${ids.tareaInterna}/comentarios`,
      `/elementos/${ids.msgInterno}`,
      `/elementos/${ids.msgInterno}/comentarios`,
      `/elementos/${ids.exVisible}`,
      `/proyectos/${p}/elementos?padre=${ids.listaInterna}`,
      `/proyectos/${p}/archivos?carpeta=${ids.carpetaInterna}`,
      `/archivos/${ids.archivoEnCarpetaInterna}`,
      `/archivos/${ids.archivoInterno}`,
      `/blobs/${ids.blobInterno}/contenido`,
      `/blobs/${ids.blobInterno2}/contenido`,
      `/proyectos/${p}/papelera`,
      '/plantillas',
      `/plantillas/${ids.plantilla}`,
    ];
    const mal = [];
    for (const r of directas) {
      const res = await client.get(r);
      const esperado = r.endsWith('/papelera') ? 403 : 404;
      if (res.status !== esperado) mal.push(`${r} → ${res.status}`);
    }
    expect(mal).toEqual([]);
  });

  it('tampoco puede escribir en lo interno', async () => {
    const intentos: [string, () => Promise<{ status: number }>][] = [
      ['comentar tarea interna', () => client.post(`/elementos/${ids.tareaInterna}/comentarios`, { body: doc(texto('x')) })],
      ['comentar mensaje interno', () => client.post(`/elementos/${ids.msgInterno}/comentarios`, { body: doc(texto('x')) })],
      ['tarea en lista interna', () => client.post(`/listas/${ids.listaInterna}/tareas`, { title: 'x' })],
      ['seguir interno', () => client.post(`/elementos/${ids.msgInterno}/seguir`)],
      ['completar interna', () => client.post(`/tareas/${ids.tareaInterna}/reabrir`)],
      ['editar interno', () => client.patch(`/elementos/${ids.msgInterno}`, { title: 'x' })],
      ['papelera interno', () => client.post(`/elementos/${ids.msgInterno}/papelera`)],
      ['marcar leído ajeno', () => client.post('/bandeja/leer', { recordingId: ids.msgInterno })],
      ['agregar plantilla', () => client.post(`/proyectos/${p}/plantillas`, { plantillaId: ids.plantilla })],
      ['guardar como plantilla', () => client.post(`/listas/${ids.listaVisible}/plantilla`, {})],
      ['editar plantilla', () => client.put(`/plantillas/${ids.plantilla}`, { name: 'x', items: [] })],
    ];
    const mal = [];
    for (const [que, f] of intentos) {
      const r = await f();
      // "marcar leído" no revela nada (marca 0): responde 200 sin efecto.
      if (que === 'marcar leído ajeno' ? r.status !== 200 : r.status !== 404) mal.push(`${que} → ${r.status}`);
    }
    expect(mal).toEqual([]);
  });

  it('el espacio usado de la cuenta no se le muestra al cliente', async () => {
    const r = (await client.get(`/proyectos/${p}/archivos`)).json;
    expect(r.almacenamiento.usados).toBeNull();
    expect(r.almacenamiento.maximo).toBeNull();
  });
});

describe('lo que el equipo ve de la vista del cliente', () => {
  it('cuánto ve el cliente y si cada cosa le llega con su cadena', async () => {
    const d = (await member.get(`/proyectos/${p}`)).json;
    expect(d.vistaCliente).toEqual({ listas: 2, mensajes: 1, carpetas: 1, archivos: 0 });
    expect((await member.get(`/tareas/${ids.tareaEnListaInterna}`)).json.tarea.visibleParaCliente).toBe(false);
    expect((await member.get(`/tareas/${ids.tareaVisible}`)).json.tarea.visibleParaCliente).toBe(true);
    expect((await member.get(`/archivos/${ids.archivoEnCarpetaInterna}`)).json.archivo.visibleParaCliente).toBe(false);
    expect((await member.get(`/elementos/${ids.msgVisible}`)).json.elemento.visibleParaCliente).toBe(true);
  });

  it('cambiar la visibilidad de una lista o carpeta ya creada', async () => {
    expect((await member.patch(`/elementos/${ids.carpetaInterna}`, { visibleToClients: true })).status).toBe(200);
    expect((await client.get(`/archivos/${ids.archivoEnCarpetaInterna}`)).status).toBe(200);
    await member.patch(`/elementos/${ids.carpetaInterna}`, { visibleToClients: false });
    expect((await client.get(`/archivos/${ids.archivoEnCarpetaInterna}`)).status).toBe(404);
  });
});
