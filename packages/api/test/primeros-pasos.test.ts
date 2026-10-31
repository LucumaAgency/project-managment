/** Primeros pasos (D-76): pasos por rol, marcados mirando los datos, y preferencias por cuenta. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { crearSesion } from '../src/lib/sesion.js';
import { cliente, type Cliente } from './http.js';
import { sembrarCuenta, sufijo, type Semilla } from './semilla.js';

let app: FastifyInstance;
let A: Semilla;
let owner: Cliente;
let member: Cliente;
let client: Cliente;

interface Paso { id: string; hecho: boolean; enlace: string; accion: string; opcional?: boolean }
const pasos = async (c: Cliente) => {
  const r = await c.get('/primeros-pasos');
  expect(r.status).toBe(200);
  return r.json as { rol: string; pasos: Paso[]; completados: number; total: number; abrirAsistente: boolean; oculto: boolean };
};
const paso = (d: { pasos: Paso[] }, id: string) => d.pasos.find((p) => p.id === id)!;

beforeAll(async () => {
  A = await sembrarCuenta('Guia');
  app = await buildApp({ logger: false, baseDomain: '' });
  owner = cliente(app, (await crearSesion(A.ownerId)).token, A.slug);
  member = cliente(app, (await crearSesion(A.memberId)).token, A.slug);
  client = cliente(app, (await crearSesion(A.clientId)).token, A.slug);
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('pasos por rol', () => {
  it('el dueño ve los pasos de armar la cuenta, marcados con los datos de la semilla', async () => {
    const d = await pasos(owner);
    expect(d.pasos.map((p) => p.id)).toEqual(['proyecto', 'tareas', 'equipo', 'cliente', 'mensaje', 'plantillas', 'bandeja']);
    expect(paso(d, 'proyecto').hecho).toBe(true);
    expect(paso(d, 'tareas').hecho).toBe(true);
    expect(paso(d, 'cliente').hecho).toBe(true);
    expect(paso(d, 'tareas').enlace).toBe(`/proyectos/${A.projectId}/tareas`);
    expect(d.completados).toBe(d.pasos.filter((p) => p.hecho).length);
  });

  it('el equipo y el cliente tienen sus propios pasos', async () => {
    expect((await pasos(member)).pasos.map((p) => p.id)).toEqual(['tareas', 'comentario', 'timeline', 'bandeja']);
    const c = await pasos(client);
    expect(c.pasos.map((p) => p.id)).toEqual(['tareas', 'comentario', 'archivos', 'bandeja']);
    expect(paso(c, 'tareas').enlace).toBe(`/proyectos/${A.projectId}/tareas`);
  });

  it('una cuenta vacía empieza sin nada hecho y los enlaces van a Proyectos', async () => {
    const s = sufijo();
    const cuenta = await prismaAdmin.account.create({ data: { name: 'Vacía', slug: `vacia-${s}` } });
    const u = await prismaAdmin.user.create({ data: { email: `duena-${s}@test.pe`, name: 'Dueña' } });
    await prismaAdmin.membership.create({ data: { accountId: cuenta.id, userId: u.id, role: 'owner' } });
    const d = await pasos(cliente(app, (await crearSesion(u.id)).token, cuenta.slug));
    expect(d.completados).toBe(0);
    expect(paso(d, 'tareas').enlace).toBe('/');
    expect(paso(d, 'tareas')).toMatchObject({ accion: 'Ir a Proyectos' });
    // Membresía creada hoy: la guía se abre sola.
    expect(d.abrirAsistente).toBe(true);
  });
});

describe('preferencias', () => {
  it('vista, ocultar y mostrar se guardan en la membresía de esta cuenta', async () => {
    const s = sufijo();
    const cuenta = await prismaAdmin.account.create({ data: { name: 'Prefs', slug: `prefs-${s}` } });
    const u = await prismaAdmin.user.create({ data: { email: `prefs-${s}@test.pe`, name: 'Prefs' } });
    await prismaAdmin.membership.create({ data: { accountId: cuenta.id, userId: u.id, role: 'admin', prefs: { email: 'resumen' } } });
    const c = cliente(app, (await crearSesion(u.id)).token, cuenta.slug);

    expect((await pasos(c)).abrirAsistente).toBe(true);
    expect((await c.post('/primeros-pasos', { accion: 'vista' })).status).toBe(200);
    expect((await pasos(c)).abrirAsistente).toBe(false);

    await c.post('/primeros-pasos', { accion: 'ocultar' });
    expect((await pasos(c)).oculto).toBe(true);
    await c.post('/primeros-pasos', { accion: 'mostrar' });
    expect((await pasos(c)).oculto).toBe(false);

    const m = await prismaAdmin.membership.findUniqueOrThrow({ where: { accountId_userId: { accountId: cuenta.id, userId: u.id } } });
    // No pisa las otras preferencias de la membresía.
    expect(m.prefs).toMatchObject({ email: 'resumen' });
    expect((await c.post('/primeros-pasos', { accion: 'otra' })).status).toBe(400);
  });

  it('a quien ya estaba en la cuenta antes de la guía no se le abre sola', async () => {
    const s = sufijo();
    const cuenta = await prismaAdmin.account.create({ data: { name: 'Antigua', slug: `antigua-${s}` } });
    const u = await prismaAdmin.user.create({ data: { email: `antigua-${s}@test.pe`, name: 'Antigua' } });
    await prismaAdmin.membership.create({ data: { accountId: cuenta.id, userId: u.id, role: 'owner', createdAt: new Date('2026-10-20T12:00:00Z') } });
    const d = await pasos(cliente(app, (await crearSesion(u.id)).token, cuenta.slug));
    expect(d.abrirAsistente).toBe(false);
    expect(d.total).toBeGreaterThan(0);
  });
});
