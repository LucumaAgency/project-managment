/** Timeline: tareas con fecha en un rango, por proyecto o de todos, con lo que ve cada quien. */
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
let ownerB: Cliente;
let otro: string;

const titulos = (r: { json: { tareas: { title: string }[] } }) => r.json.tareas.map((t) => t.title).sort();
const rango = (q = '') => `/timeline?desde=2031-03-01&hasta=2031-03-31${q}`;

beforeAll(async () => {
  [A, B] = await Promise.all([sembrarCuenta('A'), sembrarCuenta('B')]);
  app = await buildApp({ logger: false, baseDomain: '' });
  owner = cliente(app, (await crearSesion(A.ownerId)).token, A.slug);
  member = cliente(app, (await crearSesion(A.memberId)).token, A.slug);
  client = cliente(app, (await crearSesion(A.clientId)).token, A.slug);
  ownerB = cliente(app, (await crearSesion(B.ownerId)).token, B.slug);
  const visible = (await owner.post(`/proyectos/${A.projectId}/listas`, { title: 'Shoots', visibleToClients: true })).json.lista.id;
  const interna = (await owner.post(`/proyectos/${A.projectId}/listas`, { title: 'Interna' })).json.lista.id;
  await owner.post(`/listas/${visible}/tareas`, { title: 'Shoot cochera', visibleToClients: true, dueOn: '2031-03-05' });
  await owner.post(`/listas/${visible}/tareas`, { title: 'Edición reel', visibleToClients: true, startsOn: '2031-02-20', dueOn: '2031-04-10' });
  await owner.post(`/listas/${visible}/tareas`, { title: 'Fuera de rango', visibleToClients: true, dueOn: '2031-05-01' });
  await owner.post(`/listas/${visible}/tareas`, { title: 'Sin fecha', visibleToClients: true });
  await owner.post(`/listas/${interna}/tareas`, { title: 'Presupuesto interno', dueOn: '2031-03-10' });
  otro = (await owner.post('/proyectos', { name: 'Sin el miembro' })).json.proyecto.id;
  const l = (await owner.post(`/proyectos/${otro}/listas`, { title: 'L' })).json.lista.id;
  await owner.post(`/listas/${l}/tareas`, { title: 'De otro proyecto', dueOn: '2031-03-15' });
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('timeline', () => {
  it('el dueño ve todo lo que toca el rango, de todos los proyectos', async () => {
    const r = await owner.get(rango());
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(titulos(r)).toEqual(['De otro proyecto', 'Edición reel', 'Presupuesto interno', 'Shoot cochera']);
    const reel = r.json.tareas.find((t: { title: string }) => t.title === 'Edición reel');
    expect(reel).toMatchObject({ desde: '2031-02-20', hasta: '2031-04-10', lista: 'Shoots' });
  });

  it('el equipo, solo sus proyectos; filtrar por proyecto', async () => {
    expect(titulos(await member.get(rango()))).toEqual(['Edición reel', 'Presupuesto interno', 'Shoot cochera']);
    expect(titulos(await owner.get(rango(`&proyecto=${otro}`)))).toEqual(['De otro proyecto']);
    expect((await member.get(rango(`&proyecto=${otro}`))).status).toBe(404);
  });

  it('el cliente, solo lo visible; otra cuenta, nada', async () => {
    expect(titulos(await client.get(rango()))).toEqual(['Edición reel', 'Shoot cochera']);
    expect(titulos(await ownerB.get(rango()))).toEqual([]);
  });

  it('validaciones: fechas y rango', async () => {
    expect((await owner.get('/timeline?desde=marzo&hasta=2031-03-31')).status).toBe(400);
    expect((await owner.get('/timeline?desde=2031-03-01&hasta=2031-12-31')).status).toBe(400);
  });

  it('hora y lugar: se guardan, ordenan el día y se validan; los pone el equipo', async () => {
    const l = (await owner.post(`/proyectos/${A.projectId}/listas`, { title: 'Shoots de marzo', visibleToClients: true })).json.lista.id;
    const tarde = (await owner.post(`/listas/${l}/tareas`, { title: 'Shoot tarde', visibleToClients: true, dueOn: '2031-03-20', hora: '15:00', horaFin: '18:00', lugar: 'Cochera Surquillo' })).json.tarea;
    expect(tarde).toMatchObject({ hora: '15:00', horaFin: '18:00', lugar: 'Cochera Surquillo' });
    await owner.post(`/listas/${l}/tareas`, { title: 'Shoot mañana', visibleToClients: true, dueOn: '2031-03-20', hora: '09:00' });
    await owner.post(`/listas/${l}/tareas`, { title: 'Sin hora', visibleToClients: true, dueOn: '2031-03-20' });
    const del20 = (await client.get(rango())).json.tareas.filter((t: { hasta: string }) => t.hasta === '2031-03-20');
    expect(del20.map((t: { title: string }) => t.title)).toEqual(['Shoot mañana', 'Shoot tarde', 'Sin hora']);
    expect(del20[1]).toMatchObject({ hora: '15:00', horaFin: '18:00', lugar: 'Cochera Surquillo' });
    expect((await owner.patch(`/tareas/${tarde.id}`, { horaFin: '14:00' })).status).toBe(400);
    expect((await owner.patch(`/tareas/${tarde.id}`, { hora: '25:00' })).status).toBe(400);
    expect((await client.patch(`/tareas/${tarde.id}`, { lugar: 'Otro' })).status).toBe(403);
    // Quitar la hora quita la de fin.
    const sin = (await owner.patch(`/tareas/${tarde.id}`, { hora: null })).json.tarea;
    expect(sin).toMatchObject({ hora: null, horaFin: null, lugar: 'Cochera Surquillo' });
  });

  it('la fecha de inicio va antes de la de entrega, y la pone el equipo', async () => {
    const l = (await owner.post(`/proyectos/${A.projectId}/listas`, { title: 'X', visibleToClients: true })).json.lista.id;
    expect((await owner.post(`/listas/${l}/tareas`, { title: 'Mal', startsOn: '2031-03-10', dueOn: '2031-03-01' })).status).toBe(400);
    const t = (await owner.post(`/listas/${l}/tareas`, { title: 'Bien', dueOn: '2031-03-10', visibleToClients: true })).json.tarea;
    expect((await owner.patch(`/tareas/${t.id}`, { startsOn: '2031-03-12' })).status).toBe(400);
    expect((await owner.patch(`/tareas/${t.id}`, { startsOn: '2031-03-08' })).json.tarea.startsOn).toBe('2031-03-08');
    expect((await client.patch(`/tareas/${t.id}`, { startsOn: '2031-03-07' })).status).toBe(403);
  });
});
