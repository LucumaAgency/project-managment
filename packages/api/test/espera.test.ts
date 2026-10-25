/** "Se activa cuando" (D-67): esperar a otra tarea, activarse sola al completarla, plantillas. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { crearSesion } from '../src/lib/sesion.js';
import { diaEn, sumarDias } from '../src/services/recordatorios.js';
import { cliente, type Cliente } from './http.js';
import { sembrarCuenta, type Semilla } from './semilla.js';

let app: FastifyInstance;
let A: Semilla;
let owner: Cliente;
let member: Cliente;
let client: Cliente;
let lista: string;
let listaInterna: string;
const hoy = () => diaEn('America/Lima');

async function tarea(l: string, title: string, datos: object = {}) {
  const r = await owner.post(`/listas/${l}/tareas`, { title, ...datos });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return r.json.tarea;
}
const detalle = async (c: Cliente, id: string) => (await c.get(`/tareas/${id}`)).json;
const asignados = (t: { assignees: { userId: string }[] }) => t.assignees.map((a) => a.userId).sort();

beforeAll(async () => {
  A = await sembrarCuenta('A');
  app = await buildApp({ logger: false, baseDomain: '' });
  owner = cliente(app, (await crearSesion(A.ownerId)).token, A.slug);
  member = cliente(app, (await crearSesion(A.memberId)).token, A.slug);
  client = cliente(app, (await crearSesion(A.clientId)).token, A.slug);
  lista = (await owner.post(`/proyectos/${A.projectId}/listas`, { title: 'Onboarding', visibleToClients: true })).json.lista.id;
  listaInterna = (await owner.post(`/proyectos/${A.projectId}/listas`, { title: 'Interna' })).json.lista.id;
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('esperar y activarse', () => {
  it('nace esperando: sin responsables ni avisos; dice a qué espera y a quién se asignará', async () => {
    const constancia = await tarea(lista, 'Constancia', { visibleToClients: true, assigneeIds: [A.clientId] });
    const verificar = await tarea(listaInterna, 'Verificar el depósito', { assigneeIds: [A.memberId], esperaA: constancia.id, diasDespues: 2 });
    expect(verificar.assignees).toEqual([]);
    expect(verificar.dueOn).toBeNull();
    expect(verificar.espera).toMatchObject({ espera: { id: constancia.id, title: 'Constancia' }, diasDespues: 2 });
    expect(verificar.espera.seAsignaraA.map((x: { userId: string }) => x.userId)).toEqual([A.memberId]);
    expect(await prismaAdmin.notification.count({ where: { recordingId: verificar.id, userId: A.memberId } })).toBe(0);

    // El cliente completa la suya → la interna se activa: se asigna, vence en 2 días y avisa.
    expect((await client.post(`/tareas/${constancia.id}/completar`)).status).toBe(200);
    const v = (await detalle(member, verificar.id)).tarea;
    expect(asignados(v)).toEqual([A.memberId]);
    expect(v.dueOn).toBe(sumarDias(hoy(), 1));
    expect(v.espera).toBeNull();
    expect(await prismaAdmin.notification.count({ where: { recordingId: verificar.id, userId: A.memberId, reason: 'assigned' } })).toBe(1);
    const ev = await prismaAdmin.event.findFirstOrThrow({ where: { recordingId: verificar.id, action: 'activated' } });
    expect(ev).toMatchObject({ actorId: A.clientId, visibleToClients: false });
    expect(ev.details).toMatchObject({ por: constancia.id, userIds: [A.memberId] });
  });

  it('el cliente no ve el nombre de una tarea interna a la que espera algo suyo', async () => {
    const interna = await tarea(listaInterna, 'Preparar contrato');
    const firmar = await tarea(lista, 'Firmar contrato', { visibleToClients: true, assigneeIds: [A.clientId], esperaA: interna.id });
    const vista = (await detalle(client, firmar.id)).tarea;
    expect(vista.espera.espera).toEqual({ id: null, title: 'una tarea del equipo', borrada: false });
    const listado = (await client.get(`/proyectos/${A.projectId}/tareas`)).json;
    expect(JSON.stringify(listado)).not.toContain('Preparar contrato');
  });

  it('mientras espera, cambiar responsables cambia a quién se asignará (sin avisar)', async () => {
    const a = await tarea(lista, 'Brief');
    const b = await tarea(lista, 'Propuesta', { esperaA: a.id });
    await owner.patch(`/tareas/${b.id}`, { assigneeIds: [A.ownerId, A.memberId] });
    const d = (await detalle(owner, b.id)).tarea;
    expect(d.assignees).toEqual([]);
    expect(d.espera.seAsignaraA.map((x: { userId: string }) => x.userId).sort()).toEqual([A.ownerId, A.memberId].sort());
    expect(await prismaAdmin.notification.count({ where: { recordingId: b.id } })).toBe(0);
  });

  it('activar a mano (por ejemplo si la anterior se borró); solo el equipo', async () => {
    const a = await tarea(lista, 'Paso borrado');
    const b = await tarea(lista, 'Paso siguiente', { assigneeIds: [A.memberId], esperaA: a.id });
    await owner.post(`/elementos/${a.id}/papelera`);
    expect((await detalle(owner, b.id)).tarea.espera.espera).toMatchObject({ borrada: true, id: null });
    expect((await client.post(`/tareas/${b.id}/activar`)).status).toBe(404); // interna para el cliente
    const r = await member.post(`/tareas/${b.id}/activar`);
    expect(r.status).toBe(200);
    expect(asignados(r.json.tarea)).toEqual([A.memberId]);
  });

  it('quitar la espera desde la tarea la activa; ponerla deja a los responsables como previstos', async () => {
    const a = await tarea(lista, 'Uno');
    const b = await tarea(lista, 'Dos', { assigneeIds: [A.memberId] });
    await owner.patch(`/tareas/${b.id}`, { esperaA: a.id });
    let d = (await detalle(owner, b.id)).tarea;
    expect(d.assignees).toEqual([]);
    expect(d.espera.seAsignaraA[0].userId).toBe(A.memberId);
    await owner.patch(`/tareas/${b.id}`, { esperaA: null });
    d = (await detalle(owner, b.id)).tarea;
    expect(asignados(d)).toEqual([A.memberId]);
  });

  it('completar a mano una tarea que espera la saca de la espera sin asignar a nadie', async () => {
    const a = await tarea(lista, 'Antes');
    const b = await tarea(lista, 'Después', { assigneeIds: [A.memberId], esperaA: a.id });
    await owner.post(`/tareas/${b.id}/completar`);
    await owner.post(`/tareas/${a.id}/completar`);
    const d = (await detalle(owner, b.id)).tarea;
    expect(d.espera).toBeNull();
    expect(d.assignees).toEqual([]);
  });

  it('validaciones: sí misma, otra ya completa, otro proyecto, vueltas, cliente', async () => {
    const a = await tarea(lista, 'A');
    const b = await tarea(lista, 'B', { esperaA: a.id });
    expect((await owner.patch(`/tareas/${a.id}`, { esperaA: a.id })).status).toBe(400);
    expect((await owner.patch(`/tareas/${a.id}`, { esperaA: b.id })).status).toBe(400); // vuelta
    const hecha = await tarea(lista, 'Hecha');
    await owner.post(`/tareas/${hecha.id}/completar`);
    expect((await owner.patch(`/tareas/${a.id}`, { esperaA: hecha.id })).status).toBe(400);
    const otro = (await owner.post('/proyectos', { name: 'Otro' })).json.proyecto.id;
    const l2 = (await owner.post(`/proyectos/${otro}/listas`, { title: 'L' })).json.lista.id;
    const ajena = await tarea(l2, 'De otro proyecto');
    expect((await owner.patch(`/tareas/${a.id}`, { esperaA: ajena.id })).status).toBe(400);
    const suya = await tarea(lista, 'Del cliente', { visibleToClients: true, assigneeIds: [A.clientId] });
    expect((await client.patch(`/tareas/${suya.id}`, { esperaA: a.id })).status).toBe(403);
  });
});

describe('plantillas', () => {
  it('la espera viaja en la plantilla; "día N" cuenta desde que se activa; y vuelve al guardar la lista', async () => {
    const pl = await owner.post('/plantillas', {
      name: 'Con orden',
      items: [
        { title: 'Constancia', audience: 'client', dayOffset: 1 },
        { title: '', audience: 'team' }, // vacía: se descarta y las esperas se renumeran
        { title: 'Verificar', audience: 'team', dayOffset: 2, waitsFor: 1 },
        { title: 'Kickoff', audience: 'any', dayOffset: 3, waitsFor: 3 },
      ],
    });
    expect(pl.status, JSON.stringify(pl.json)).toBe(200);
    expect(pl.json.plantilla.items.map((i: { waitsFor: number | null }) => i.waitsFor)).toEqual([null, 1, 2]);

    const ap = await owner.post(`/proyectos/${A.projectId}/plantillas`, { plantillaId: pl.json.plantilla.id, inicio: '2030-03-01', responsableId: A.memberId });
    const l = (await owner.get(`/proyectos/${A.projectId}/tareas`)).json.listas.find((x: { id: string }) => x.id === ap.json.lista.id);
    const [constancia, verificar, kickoff] = l.tareas;
    expect(constancia).toMatchObject({ dueOn: '2030-03-01', espera: null });
    expect(asignados(constancia)).toEqual([A.clientId]);
    expect(verificar).toMatchObject({ dueOn: null, assignees: [], espera: { espera: { id: constancia.id }, diasDespues: 2 } });
    expect(kickoff.espera.espera.id).toBe(verificar.id);
    expect(kickoff.espera.seAsignaraA.map((x: { userId: string }) => x.userId).sort()).toEqual([A.memberId, A.clientId].sort());

    // En cadena: completar la primera activa la segunda, no la tercera.
    await client.post(`/tareas/${constancia.id}/completar`);
    const despues = (await owner.get(`/proyectos/${A.projectId}/tareas`)).json.listas.find((x: { id: string }) => x.id === ap.json.lista.id).tareas;
    expect(despues.find((t: { id: string }) => t.id === verificar.id)).toMatchObject({ espera: null, dueOn: sumarDias(hoy(), 1) });
    expect(despues.find((t: { id: string }) => t.id === kickoff.id).espera).not.toBeNull();

    const copia = await owner.post(`/listas/${ap.json.lista.id}/plantilla`, {});
    expect(copia.json.plantilla.items.map((i: { title: string; waitsFor: number | null; dayOffset: number | null; audience: string }) => [i.title, i.waitsFor, i.audience])).toEqual([
      ['Constancia', null, 'client'],
      ['Verificar', null, 'team'], // ya se activó: no espera
      ['Kickoff', 2, 'any'],
    ]);
    expect(copia.json.plantilla.items[2].dayOffset).toBe(3);
  });

  it('una espera a una tarea posterior (o a sí misma) no se acepta', async () => {
    const r = await owner.post('/plantillas', { name: 'Mal', items: [{ title: 'A', audience: 'team', waitsFor: 2 }, { title: 'B', audience: 'team' }] });
    expect(r.status).toBe(400);
    const r2 = await owner.post('/plantillas', { name: 'Mal', items: [{ title: 'A', audience: 'team', waitsFor: 1 }] });
    expect(r2.status).toBe(400);
  });
});
