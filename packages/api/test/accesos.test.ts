/** Accesos protegidos (D-66): cifrados, solo el equipo los ve con un clic y queda registrado. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma, prismaAdmin } from '../src/db.js';
import { env } from '../src/env.js';
import { claveDesde } from '../src/lib/cifrado.js';
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
let tokenOwner: string;
let tarea: string;
const SECRETO = 'S3cr3t-zz9';
const USUARIO = 'rosa-zz9';

const responder = (c: Cliente, respuestas: object) => c.put(`/tareas/${tarea}/respuestas`, { respuestas });
const ver = (c: Cliente, campo = 'c1') => c.post(`/tareas/${tarea}/campos/${campo}/ver`);

beforeAll(async () => {
  [A, B] = await Promise.all([sembrarCuenta('A'), sembrarCuenta('B')]);
  app = await buildApp({ logger: false, baseDomain: '' });
  tokenOwner = (await crearSesion(A.ownerId)).token;
  owner = cliente(app, tokenOwner, A.slug);
  member = cliente(app, (await crearSesion(A.memberId)).token, A.slug);
  client = cliente(app, (await crearSesion(A.clientId)).token, A.slug);
  ownerB = cliente(app, (await crearSesion(B.ownerId)).token, B.slug);
  const lista = (await owner.post(`/proyectos/${A.projectId}/listas`, { title: 'Web', visibleToClients: true })).json.lista.id;
  tarea = (
    await owner.post(`/listas/${lista}/tareas`, {
      title: 'Accesos',
      visibleToClients: true,
      assigneeIds: [A.clientId],
      campos: [
        { etiqueta: 'Hosting', tipo: 'acceso' },
        { etiqueta: 'Dominio', tipo: 'acceso', obligatorio: false },
      ],
    })
  ).json.tarea.id;
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
});

describe('guardar', () => {
  it('el cliente lo carga; la respuesta solo dice el proveedor y que está protegido', async () => {
    const r = await responder(client, { c1: { proveedor: 'Hostinger', url: 'hpanel.hostinger.com', usuario: USUARIO, clave: SECRETO } });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.seCompleto).toBe(true);
    expect(r.json.tarea.campos[0].respuesta.valor).toEqual({ proveedor: 'Hostinger', protegido: true });
    expect(JSON.stringify(r.json)).not.toContain(SECRETO);
    expect(JSON.stringify(r.json)).not.toContain(USUARIO);
  });

  it('en la base va cifrado; la actividad y los avisos no lo llevan', async () => {
    const fila = await prismaAdmin.taskAnswer.findFirstOrThrow({ where: { recordingId: tarea, fieldId: 'c1' } });
    expect(JSON.stringify(fila.value)).not.toContain(SECRETO);
    expect(JSON.stringify(fila.value)).not.toContain(USUARIO);
    expect((fila.value as { cifrado: string }).cifrado).toMatch(/^v1\./);
    const eventos = await prismaAdmin.event.findMany({ where: { recordingId: tarea } });
    expect(JSON.stringify(eventos)).not.toContain(SECRETO);
  });

  it('nadie lo recibe de vuelta en el detalle, la lista ni la ficha', async () => {
    for (const c of [client, member, owner]) {
      const textos = [
        JSON.stringify((await c.get(`/tareas/${tarea}`)).json),
        JSON.stringify((await c.get(`/proyectos/${A.projectId}/tareas`)).json),
        JSON.stringify((await c.get(`/proyectos/${A.projectId}/ficha`)).json),
      ];
      for (const t of textos) {
        expect(t).not.toContain(SECRETO);
        expect(t).not.toContain(USUARIO);
      }
    }
  });

  it('un acceso vacío no borra el que había; para quitarlo hay que pedirlo', async () => {
    await responder(client, { c1: {} });
    expect(await prismaAdmin.taskAnswer.count({ where: { recordingId: tarea, fieldId: 'c1' } })).toBe(1);
    await responder(client, { c2: { proveedor: 'Punto.pe', usuario: 'x', clave: 'y' } });
    await responder(client, { c2: { borrar: true } });
    expect(await prismaAdmin.taskAnswer.count({ where: { recordingId: tarea, fieldId: 'c2' } })).toBe(0);
  });
});

describe('ver', () => {
  it('el cliente no lo vuelve a ver, ni otra cuenta', async () => {
    expect((await ver(client)).status).toBe(403);
    expect((await ver(ownerB)).status).toBe(404);
  });

  it('el equipo lo ve con un clic y queda registrado quién lo vio', async () => {
    const r = await ver(member);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.acceso).toEqual({ proveedor: 'Hostinger', url: 'hpanel.hostinger.com', usuario: USUARIO, clave: SECRETO });
    const memberNombre = (await prismaAdmin.user.findUniqueOrThrow({ where: { id: A.memberId } })).name;
    expect(r.json.vistas[0]).toMatchObject({ campoId: 'c1', nombre: memberNombre });
    expect(await prismaAdmin.auditLog.count({ where: { accountId: A.accountId, action: 'acceso.ver', entityId: tarea, userId: A.memberId } })).toBe(1);
    // El detalle (para el equipo) dice quién lo vio; al cliente no.
    expect((await owner.get(`/tareas/${tarea}`)).json.tarea.vistasAccesos[0].nombre).toBe(memberNombre);
    expect((await client.get(`/tareas/${tarea}`)).json.tarea.vistasAccesos).toBeUndefined();
  });

  it('campo sin acceso guardado o que no es acceso', async () => {
    expect((await ver(member, 'c2')).status).toBe(404);
    expect((await ver(member, 'c9')).status).toBe(404);
  });

  it('con otra clave en el servidor no se lee (y lo dice); sin clave no se guardan', async () => {
    const antes = env.accesosClave;
    try {
      env.accesosClave = 'b'.repeat(64);
      const r = await ver(member);
      expect(r.status).toBe(500);
      expect(r.json.error).toContain('ACCESOS_CLAVE');
      env.accesosClave = '';
      expect((await responder(client, { c2: { usuario: 'x', clave: 'y' } })).status).toBe(503);
    } finally {
      env.accesosClave = antes;
    }
  });
});

describe('exportar', () => {
  it('la exportación no lleva el acceso, solo el proveedor', async () => {
    const r = await app.inject({ url: '/api/v1/cuenta/exportar', headers: { cookie: `${COOKIE_SESION}=${tokenOwner}`, 'x-cuenta': A.slug } });
    expect(r.statusCode).toBe(200);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-accesos-'));
    const zip = path.join(tmp, 'e.zip');
    fs.writeFileSync(zip, r.rawPayload);
    execFileSync('python3', ['-I', '-m', 'zipfile', '-e', zip, `${zip}.d`]);
    let todo = '';
    for (const f of fs.readdirSync(`${zip}.d`, { recursive: true }) as string[]) {
      const p = path.join(`${zip}.d`, f);
      if (fs.statSync(p).isFile()) todo += fs.readFileSync(p, 'latin1');
    }
    expect(todo).not.toContain(SECRETO);
    expect(todo).not.toContain(USUARIO);
    expect(todo).not.toContain('v1.');
    expect(todo).toContain('Hostinger');
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe('la clave', () => {
  it('acepta 64 hex o 32 bytes en base64; lo demás no', () => {
    expect(claveDesde('a'.repeat(64))?.length).toBe(32);
    expect(claveDesde(Buffer.alloc(32, 7).toString('base64'))?.length).toBe(32);
    expect(claveDesde('corta')).toBeNull();
    expect(claveDesde('')).toBeNull();
  });
});
