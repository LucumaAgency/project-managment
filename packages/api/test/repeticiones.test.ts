/** Reporte mensual (D-73): plantilla con carpeta y nombre por mes, PDF a la carpeta, repetición cada mes. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { expandirMarcadores, siguienteDiaDelMes } from '../src/lib/marcadores.js';
import { COOKIE_SESION, crearSesion } from '../src/lib/sesion.js';
import { crearClave } from '../src/services/bot.js';
import { repeticionesDeCuenta } from '../src/services/repeticiones.js';
import { cliente, type Cliente } from './http.js';
import { sembrarCuenta, type Semilla } from './semilla.js';

let app: FastifyInstance;
let A: Semilla;
let owner: Cliente;
let member: Cliente;
let client: Cliente;
let tokens: { owner: string; client: string };
let clave: string;
let plantillaId: string;

const PDF = Buffer.from('%PDF-1.4\n% reporte\n');

const REPORTE = {
  name: 'Reporte Google Ads',
  description: 'Auditoría mensual de la campaña.',
  listTitle: 'Reporte Google Ads · {mes-1}',
  folderPath: 'Reportes / {aaaa-mm-1} · Google Ads',
  folderVisibleToClients: true,
  items: [
    { title: 'Bajar datos del mes', audience: 'team', dayOffset: 1, campos: [{ etiqueta: 'Exports', tipo: 'archivo' }] },
    { title: 'Informe en PDF', audience: 'team', dayOffset: 5, campos: [{ etiqueta: 'Informe', tipo: 'archivo', aCarpeta: true }] },
  ],
};

const bot = (url: string, body: object) =>
  app.inject({ method: 'POST', url: `/api/v1${url}`, headers: { authorization: `Bearer ${clave}` }, payload: body });
const subir = (token: string, id: string, campo: string, nombre: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/tareas/${id}/campos/${campo}/archivos?nombre=${encodeURIComponent(nombre)}`,
    headers: { cookie: `${COOKIE_SESION}=${token}`, 'x-cuenta': A.slug, 'content-type': 'application/octet-stream' },
    payload: PDF,
  });

async function listas(c: Cliente) {
  const r = await c.get(`/proyectos/${A.projectId}/tareas`);
  expect(r.status).toBe(200);
  return r.json.listas as { id: string; title: string; tareas: { id: string; title: string }[] }[];
}

beforeAll(async () => {
  A = await sembrarCuenta('A');
  app = await buildApp({ logger: false, baseDomain: '' });
  tokens = { owner: (await crearSesion(A.ownerId)).token, client: (await crearSesion(A.clientId)).token };
  owner = cliente(app, tokens.owner, A.slug);
  member = cliente(app, (await crearSesion(A.memberId)).token, A.slug);
  client = cliente(app, tokens.client, A.slug);
  const u = await prismaAdmin.user.create({ data: { email: `bot-rep-${A.slug}@bots.invalid`, name: 'Bot Lucuma', isBot: true } });
  await prismaAdmin.membership.create({ data: { accountId: A.accountId, userId: u.id, role: 'admin' } });
  clave = await crearClave(A.accountId, u.id, 'prueba');
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('marcadores de mes', () => {
  it('mes y mes anterior, también en enero', () => {
    expect(expandirMarcadores('R · {mes-1} · {aaaa-mm-1} · {mes} · {aaaa-mm}', '2026-11-01')).toBe('R · Octubre 2026 · 2026-10 · Noviembre 2026 · 2026-11');
    expect(expandirMarcadores('{mes-1} {aaaa-mm-1}', '2027-01-01')).toBe('Diciembre 2026 2026-12');
  });
  it('siguiente día del mes, siempre después', () => {
    expect(siguienteDiaDelMes('2026-10-25', 1)).toBe('2026-11-01');
    expect(siguienteDiaDelMes('2026-10-25', 28)).toBe('2026-10-28');
    expect(siguienteDiaDelMes('2026-11-01', 1)).toBe('2026-12-01');
    expect(siguienteDiaDelMes('2026-12-05', 3)).toBe('2027-01-03');
  });
});

describe('plantilla con carpeta', () => {
  it('guarda el nombre de la lista, la carpeta y el campo que va a la carpeta', async () => {
    const r = await owner.post('/plantillas', REPORTE);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    plantillaId = r.json.plantilla.id;
    expect(r.json.plantilla).toMatchObject({ listTitle: 'Reporte Google Ads · {mes-1}', folderPath: 'Reportes / {aaaa-mm-1} · Google Ads', folderVisibleToClients: true });
    expect(r.json.plantilla.items[1].campos[0]).toMatchObject({ tipo: 'archivo', aCarpeta: true });
    expect(r.json.plantilla.items[0].campos[0].aCarpeta).toBeUndefined();
  });

  let informe: string;
  it('al agregarla crea la carpeta del mes y la lista con el nombre del mes', async () => {
    const r = await owner.post(`/proyectos/${A.projectId}/plantillas`, { plantillaId, inicio: '2026-11-01', repetirDia: 1 });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.lista.title).toBe('Reporte Google Ads · Octubre 2026');
    expect(r.json.repeticion).toMatchObject({ dia: 1, proxima: '2026-12-01' });

    const raiz = await client.get(`/proyectos/${A.projectId}/archivos`);
    const reportes = raiz.json.carpetas.find((c: { title: string }) => c.title === 'Reportes');
    expect(reportes, 'el cliente ve Reportes').toBeTruthy();
    const dentro = await client.get(`/proyectos/${A.projectId}/archivos?carpeta=${reportes.id}`);
    expect(dentro.json.carpetas.map((c: { title: string }) => c.title)).toEqual(['2026-10 · Google Ads']);
    expect(dentro.json.carpetas[0].id).toBe(r.json.carpeta.id);

    const lista = (await listas(owner)).find((l) => l.id === r.json.lista.id)!;
    informe = lista.tareas.find((t) => t.title === 'Informe en PDF')!.id;
  });

  it('el PDF subido a la tarea queda en la carpeta, a la vista del cliente', async () => {
    const r = await subir(tokens.owner, informe, 'c1', 'Lucuma Agency - Reporte A Octubre 2026.pdf');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().archivoId).toBeTruthy();
    expect(r.json().seCompleto).toBe(true);

    const raiz = await client.get(`/proyectos/${A.projectId}/archivos`);
    const reportes = raiz.json.carpetas.find((c: { title: string }) => c.title === 'Reportes');
    const mes = (await client.get(`/proyectos/${A.projectId}/archivos?carpeta=${reportes.id}`)).json.carpetas[0];
    const archivos = (await client.get(`/proyectos/${A.projectId}/archivos?carpeta=${mes.id}`)).json.archivos;
    expect(archivos.map((a: { title: string }) => a.title)).toEqual(['Lucuma Agency - Reporte A Octubre 2026.pdf']);
  });

  it('el campo de exports (sin "a la carpeta") no deja nada en Archivos', async () => {
    const lista = (await listas(owner)).find((l) => l.title === 'Reporte Google Ads · Octubre 2026')!;
    const datos = lista.tareas.find((t) => t.title === 'Bajar datos del mes')!.id;
    const r = await subir(tokens.owner, datos, 'c1', 'ads.csv');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().archivoId).toBeUndefined();
  });

  it('agregarla otra vez el mismo mes reutiliza la carpeta', async () => {
    const r = await owner.post(`/proyectos/${A.projectId}/plantillas`, { plantillaId, inicio: '2026-11-03' });
    expect(r.status).toBe(200);
    const raiz = await owner.get(`/proyectos/${A.projectId}/archivos`);
    expect(raiz.json.carpetas.filter((c: { title: string }) => c.title === 'Reportes')).toHaveLength(1);
    expect(r.json.repeticion).toBeNull();
  });
});

describe('repetición cada mes', () => {
  it('se ve en el proyecto (para el equipo, no para el cliente)', async () => {
    const r = await member.get(`/proyectos/${A.projectId}/repeticiones`);
    expect(r.status).toBe(200);
    const mia = r.json.repeticiones.find((x: { plantilla: { id: string } }) => x.plantilla.id === plantillaId);
    expect(mia).toMatchObject({ dia: 1, proxima: '2026-12-01', error: null });
    expect((await client.get(`/proyectos/${A.projectId}/repeticiones`)).json.repeticiones).toEqual([]);
  });

  it('el latido la agrega el día que toca, una sola vez, y le avisa al responsable aunque sea quien la programó', async () => {
    expect(await repeticionesDeCuenta(A.accountId, new Date('2026-11-30T15:00:00Z'))).toBe(0);
    expect(await repeticionesDeCuenta(A.accountId, new Date('2026-12-01T15:00:00Z'))).toBe(1);
    expect(await repeticionesDeCuenta(A.accountId, new Date('2026-12-01T16:00:00Z'))).toBe(0);

    const nueva = (await listas(owner)).filter((l) => l.title === 'Reporte Google Ads · Noviembre 2026');
    expect(nueva).toHaveLength(1);
    const aviso = await prismaAdmin.notification.findFirst({ where: { userId: A.ownerId, recordingId: nueva[0].id } });
    expect(aviso?.reason).toBe('assigned');

    const raiz = await owner.get(`/proyectos/${A.projectId}/archivos`);
    const reportes = raiz.json.carpetas.find((c: { title: string }) => c.title === 'Reportes');
    const meses = (await owner.get(`/proyectos/${A.projectId}/archivos?carpeta=${reportes.id}`)).json.carpetas.map((c: { title: string }) => c.title);
    expect(meses.sort()).toEqual(['2026-10 · Google Ads', '2026-11 · Google Ads']);

    const rep = (await owner.get(`/proyectos/${A.projectId}/repeticiones`)).json.repeticiones.find((x: { plantilla: { id: string } }) => x.plantilla.id === plantillaId);
    expect(rep).toMatchObject({ proxima: '2027-01-01', ultima: '2026-12-01' });
  });

  it('atrasada varios meses: se agrega una vez y sigue desde hoy', async () => {
    expect(await repeticionesDeCuenta(A.accountId, new Date('2027-03-10T15:00:00Z'))).toBe(1);
    const rep = (await owner.get(`/proyectos/${A.projectId}/repeticiones`)).json.repeticiones.find((x: { plantilla: { id: string } }) => x.plantilla.id === plantillaId);
    expect(rep.proxima).toBe('2027-04-01');
  });

  it('si falla, lo anota y pasa al mes siguiente (no reintenta cada hora)', async () => {
    await prismaAdmin.project.update({ where: { id: A.projectId }, data: { status: 'archived', archivedAt: new Date() } });
    try {
      expect(await repeticionesDeCuenta(A.accountId, new Date('2027-04-01T15:00:00Z'))).toBe(0);
      const rep = (await owner.get(`/proyectos/${A.projectId}/repeticiones`)).json.repeticiones.find((x: { plantilla: { id: string } }) => x.plantilla.id === plantillaId);
      expect(rep.proxima).toBe('2027-05-01');
      expect(rep.error).toMatch(/^2027-04-01: /);
    } finally {
      await prismaAdmin.project.update({ where: { id: A.projectId }, data: { status: 'active', archivedAt: null } });
    }
  });

  it('el cliente no la quita; el dueño sí', async () => {
    const id = (await owner.get(`/proyectos/${A.projectId}/repeticiones`)).json.repeticiones.find((x: { plantilla: { id: string } }) => x.plantilla.id === plantillaId).id;
    expect((await client.delete(`/repeticiones/${id}`)).status).toBe(404);
    expect((await owner.delete(`/repeticiones/${id}`)).status).toBe(200);
    expect((await owner.get(`/proyectos/${A.projectId}/repeticiones`)).json.repeticiones.some((x: { id: string }) => x.id === id)).toBe(false);
  });

  it('día fuera de rango: 400', async () => {
    expect((await owner.post(`/proyectos/${A.projectId}/plantillas`, { plantillaId, repetirDia: 31 })).status).toBe(400);
  });
});

describe('por el bot', () => {
  it('carga la plantilla con carpeta y la programa cada mes; sin responsable no la repite', async () => {
    const g = await bot('/bot/plantillas', {
      nombre: 'Reporte SEO',
      lista: 'Reporte SEO · {mes-1}',
      carpeta: 'Reportes/{aaaa-mm-1} · SEO',
      tareas: [{ titulo: 'Informe en PDF', pide: [{ nombre: 'Informe', tipo: 'archivo', aCarpeta: true }] }],
    });
    expect(g.statusCode, g.body).toBe(200);
    const proyecto = (await prismaAdmin.project.findUniqueOrThrow({ where: { id: A.projectId } })).name;

    const sin = await bot('/bot/plantillas/aplicar', { proyecto, plantilla: 'Reporte SEO', repetirDia: 1 });
    expect(sin.statusCode).toBe(400);

    const dueño = (await prismaAdmin.user.findUniqueOrThrow({ where: { id: A.ownerId } })).name;
    const r = await bot('/bot/plantillas/aplicar', { proyecto, plantilla: 'Reporte SEO', inicio: '2026-11-01', responsable: dueño, repetirDia: 1 });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ lista: 'Reporte SEO · Octubre 2026', carpeta: true, repeticion: { dia: 1, proxima: '2026-12-01' } });
  });
});
