/** Día 12: recordatorios de tareas que vencen (una sola vez, a quien corresponde) y el latido. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { env } from '../src/env.js';
import { crearSesion } from '../src/lib/sesion.js';
import { diaEn, olvidarDisparos, recordatoriosDeCuenta, sumarDias } from '../src/services/recordatorios.js';
import { cliente, type Cliente } from './http.js';
import { sembrarCuenta, type Semilla } from './semilla.js';

let app: FastifyInstance;
let A: Semilla;
let owner: Cliente;
let member: Cliente;
let client: Cliente;
let projectId: string;
const hoy = diaEn('America/Lima');
const manana = sumarDias(hoy, 1);
const ayer = sumarDias(hoy, -1);

const recordatoriosDe = (userId: string, recordingId: string) =>
  prismaAdmin.notification.findMany({ where: { userId, recordingId, reason: 'due_soon' }, select: { dedupeKey: true } });

async function tarea(dueOn: string, datos: object = {}, visible = false) {
  const l = (await member.post(`/proyectos/${projectId}/listas`, { title: 'L', visibleToClients: visible })).json.lista.id;
  return (await member.post(`/listas/${l}/tareas`, { title: `Vence ${dueOn}`, dueOn, visibleToClients: visible, ...datos })).json.tarea.id as string;
}

beforeAll(async () => {
  A = await sembrarCuenta('A');
  app = await buildApp({ logger: false, baseDomain: '' });
  const s = async (id: string) => cliente(app, (await crearSesion(id)).token, A.slug);
  [owner, member, client] = await Promise.all([s(A.ownerId), s(A.memberId), s(A.clientId)]);
  projectId = (await owner.post('/proyectos', { name: 'Recordatorios' })).json.proyecto.id;
  for (const userId of [A.memberId, A.clientId]) await owner.post(`/proyectos/${projectId}/personas`, { userId });
});
beforeEach(() => olvidarDisparos());

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('recordatorios', () => {
  it('vence mañana: al responsable, una sola vez aunque se calcule dos veces', async () => {
    const t = await tarea(manana, { assigneeIds: [A.ownerId] });
    await recordatoriosDeCuenta(A.accountId);
    await Promise.all([recordatoriosDeCuenta(A.accountId), recordatoriosDeCuenta(A.accountId)]);
    expect(await recordatoriosDe(A.ownerId, t)).toEqual([{ dedupeKey: `vence:${t}:${A.ownerId}:${manana}:manana` }]);
    expect(await recordatoriosDe(A.memberId, t)).toEqual([]); // la creó, pero tiene responsable
  });

  it('sin responsable, le llega a quien la creó', async () => {
    const t = await tarea(manana);
    await recordatoriosDeCuenta(A.accountId);
    expect(await recordatoriosDe(A.memberId, t)).toHaveLength(1);
  });

  it('venció ayer y sigue abierta: "vencida"; completada o lejana: nada', async () => {
    const vencida = await tarea(ayer, { assigneeIds: [A.memberId] });
    const hecha = await tarea(ayer, { assigneeIds: [A.memberId] });
    await member.post(`/tareas/${hecha}/completar`);
    const lejana = await tarea(sumarDias(hoy, 5), { assigneeIds: [A.memberId] });
    await recordatoriosDeCuenta(A.accountId);
    expect((await recordatoriosDe(A.memberId, vencida))[0]?.dedupeKey).toMatch(/:vencida$/);
    expect(await recordatoriosDe(A.memberId, hecha)).toEqual([]);
    expect(await recordatoriosDe(A.memberId, lejana)).toEqual([]);
  });

  it('al cliente, solo si la tarea es visible; nada de listas en la papelera ni proyectos archivados', async () => {
    const visible = await tarea(manana, { assigneeIds: [A.clientId] }, true);
    await recordatoriosDeCuenta(A.accountId);
    expect(await recordatoriosDe(A.clientId, visible)).toHaveLength(1);
    // Lista en la papelera: sus tareas no recuerdan nada.
    const interna = await tarea(ayer, { assigneeIds: [A.memberId] });
    const l = (await prismaAdmin.recording.findUniqueOrThrow({ where: { id: interna }, select: { parentId: true } })).parentId!;
    await member.post(`/elementos/${l}/papelera`);
    await recordatoriosDeCuenta(A.accountId);
    expect(await recordatoriosDe(A.memberId, interna)).toEqual([]);

    const p = (await owner.post('/proyectos', { name: 'Archivado' })).json.proyecto.id;
    const l2 = (await owner.post(`/proyectos/${p}/listas`, { title: 'L' })).json.lista.id;
    const t2 = (await owner.post(`/listas/${l2}/tareas`, { title: 'T', dueOn: manana })).json.tarea.id;
    await owner.post(`/proyectos/${p}/archivar`);
    await recordatoriosDeCuenta(A.accountId);
    expect(await recordatoriosDe(A.ownerId, t2)).toEqual([]);
  });

  it('en la bandeja: dice qué tarea, si vence mañana o venció, y la abre', async () => {
    const t = await tarea(manana, { title: 'Enviar arte final', assigneeIds: [A.ownerId] });
    await recordatoriosDeCuenta(A.accountId);
    const aviso = (await owner.get('/bandeja')).json.avisos.find((a: { abre: string }) => a.abre === t);
    expect(aviso).toMatchObject({
      reason: 'due_soon',
      evento: null,
      proyecto: { id: projectId },
      recordatorio: { tarea: 'Enviar arte final', dueOn: manana, tipo: 'manana', completada: false },
    });
  });

  it('se calcula solo al usar la app (contador de la bandeja)', async () => {
    const t = await tarea(manana, { assigneeIds: [A.memberId] });
    await member.get('/bandeja/contador');
    await new Promise((r) => setTimeout(r, 300));
    expect(await recordatoriosDe(A.memberId, t)).toHaveLength(1);
  });
});

describe('latido externo', () => {
  it('sin CRON_TOKEN configurado: 503; con token incorrecto: 401; correcto: crea los pendientes', async () => {
    const antes = env.cronToken;
    try {
      env.cronToken = '';
      expect((await app.inject({ url: '/api/v1/cron/latido' })).statusCode).toBe(503);
      env.cronToken = 'secreto-de-prueba-largo';
      expect((await app.inject({ url: '/api/v1/cron/latido', headers: { 'x-pm-cron': 'otro' } })).statusCode).toBe(401);
      const t = await tarea(manana, { assigneeIds: [A.ownerId] });
      const r = await app.inject({ url: '/api/v1/cron/latido', headers: { 'x-pm-cron': 'secreto-de-prueba-largo' } });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toMatchObject({ ok: true });
      expect(await recordatoriosDe(A.ownerId, t)).toHaveLength(1);
      expect((await app.inject({ url: '/api/v1/cron/latido?token=secreto-de-prueba-largo' })).statusCode).toBe(200);
    } finally {
      env.cronToken = antes;
    }
  });
});

describe('días', () => {
  it('el día se calcula en la zona de la cuenta', () => {
    const casiMedianocheLima = new Date('2026-11-01T04:30:00Z'); // 31-oct 23:30 en Lima
    expect(diaEn('America/Lima', casiMedianocheLima)).toBe('2026-10-31');
    expect(diaEn('Europe/Madrid', casiMedianocheLima)).toBe('2026-11-01');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(diaEn('Zona/Inventada', casiMedianocheLima)).toBe('2026-10-31'); // cae en Lima
  });
});
