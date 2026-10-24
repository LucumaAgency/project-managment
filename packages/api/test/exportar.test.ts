/** Día 14: exportar la cuenta como ZIP (lo abre python3 -m zipfile, que hay aquí y en el CI). */
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
import { nombreZip, unicos } from '../src/services/exportar.js';
import { cliente, type Cliente } from './http.js';
import { sembrarCuenta, unirACuenta, type Semilla } from './semilla.js';

let app: FastifyInstance;
let A: Semilla;
let B: Semilla;
let owner: Cliente;
let tokenOwner: string;
let tmp: string;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('png exportado')]);
const PNG2 = Buffer.concat([PNG, Buffer.from(' v2')]);

/** Pide la exportación y devuelve { status, entradas: Map<ruta, Buffer> }. */
async function exportar(token: string, slug = A.slug) {
  const r = await app.inject({ url: '/api/v1/cuenta/exportar', headers: { cookie: `${COOKIE_SESION}=${token}`, 'x-cuenta': slug } });
  if (r.statusCode !== 200) return { status: r.statusCode, headers: r.headers, entradas: new Map<string, Buffer>() };
  const zip = path.join(tmp, `e-${Date.now()}.zip`);
  fs.writeFileSync(zip, r.rawPayload);
  const destino = `${zip}.d`;
  execFileSync('python3', ['-I', '-m', 'zipfile', '-e', zip, destino]);
  const entradas = new Map<string, Buffer>();
  for (const f of fs.readdirSync(destino, { recursive: true }) as string[]) {
    const p = path.join(destino, f);
    if (fs.statSync(p).isFile()) entradas.set(f.split(path.sep).join('/'), fs.readFileSync(p));
  }
  return { status: 200, headers: r.headers, entradas };
}

async function subir(proyecto: string, url: string, cuerpo: Buffer) {
  const r = await app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: { cookie: `${COOKIE_SESION}=${tokenOwner}`, 'x-cuenta': A.slug, 'content-type': 'application/octet-stream' },
    payload: cuerpo,
  });
  return r.json().archivo;
}

beforeAll(async () => {
  [A, B] = await Promise.all([sembrarCuenta('A'), sembrarCuenta('B')]);
  app = await buildApp({ logger: false, baseDomain: '' });
  tokenOwner = (await crearSesion(A.ownerId)).token;
  owner = cliente(app, tokenOwner, A.slug);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-export-'));
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
  fs.rmSync(env.archivosDir, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('nombres dentro del ZIP', () => {
  it('limpia lo peligroso y no repite', () => {
    expect(nombreZip('../../etc/passwd')).toBe('passwd');
    expect(nombreZip('a:b*c?.png')).toBe('a-b-c-.png');
    expect(nombreZip('..')).toBe('archivo');
    const u = unicos();
    expect([u('x/a.png'), u('x/A.png'), u('x/a.png'), u('x/sin')]).toEqual(['x/a.png', 'x/A (2).png', 'x/a (3).png', 'x/sin']);
  });
});

describe('exportar la cuenta', () => {
  it('trae cuenta, proyectos, tareas, mensajes y archivos con sus versiones', async () => {
    const p = (await owner.post('/proyectos', { name: 'Web: rediseño' })).json.proyecto.id;
    await owner.post(`/proyectos/${p}/personas`, { userId: A.memberId });
    const l = (await owner.post(`/proyectos/${p}/elementos`, { type: 'todolist', title: 'Lanzamiento' })).json.elemento.id;
    await owner.post(`/listas/${l}/tareas`, { title: '=HYPERLINK("x") revisar', dueOn: '2030-05-01', assigneeIds: [A.memberId] });
    await owner.post(`/proyectos/${p}/elementos`, {
      type: 'message',
      title: 'Bienvenida',
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hola equipo <script>' }] }] },
    });
    const carpeta = (await owner.post(`/proyectos/${p}/elementos`, { type: 'folder', title: 'Entregas' })).json.elemento.id;
    const a = await subir(p, `/proyectos/${p}/archivos?nombre=logo.png&carpeta=${carpeta}`, PNG);
    await subir(p, `/archivos/${a.id}/versiones?nombre=logo.png`, PNG2);

    const r = await exportar(tokenOwner);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/zip');
    expect(String(r.headers['content-disposition'])).toMatch(/attachment; filename=".+-exportacion-\d{4}-\d{2}-\d{2}\.zip"/);
    const e = r.entradas;
    const base = 'proyectos/Web- rediseño';

    const cuenta = JSON.parse(e.get('cuenta.json')!.toString());
    expect(cuenta.cuenta.id).toBe(A.accountId);
    expect(cuenta.personas.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining([A.ownerId, A.memberId, A.clientId]));
    expect(e.has('LEEME.txt')).toBe(true);

    const datos = JSON.parse(e.get(`${base}/datos.json`)!.toString());
    expect(datos.elementos.map((x: { type: string }) => x.type)).toEqual(expect.arrayContaining(['todolist', 'todo', 'message', 'folder', 'upload']));
    expect(datos.actividad.length).toBeGreaterThan(3);

    // Archivo vigente con su nombre, la versión anterior con (v1); bytes intactos.
    expect(e.get(`${base}/archivos/Entregas/logo.png`)).toEqual(PNG2);
    expect(e.get(`${base}/archivos/Entregas/logo (v1).png`)).toEqual(PNG);

    // CSV: con BOM, y una fórmula no se ejecuta en la hoja de cálculo.
    const csv = e.get(`${base}/tareas.csv`)!.toString();
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(`"'=HYPERLINK(""x"") revisar"`);
    expect(csv).toContain('2030-05-01');

    // El mensaje como página, con el HTML ya limpio del servidor (sin <script>).
    const html = e.get(`${base}/mensajes/Bienvenida.html`)!.toString();
    expect(html).toContain('Hola equipo &lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('solo trae lo de su cuenta', async () => {
    const ownerB = cliente(app, (await crearSesion(B.ownerId)).token, B.slug);
    await ownerB.post('/proyectos', { name: 'Secreto de B' });
    const r = await exportar(tokenOwner);
    const todo = [...r.entradas.entries()].map(([k, v]) => k + v.toString()).join('\n');
    expect(todo).not.toContain('Secreto de B');
    expect(todo).not.toContain(B.accountId);
  });

  it('si un archivo falta en disco, el ZIP sale igual y lo avisa en LEEME', async () => {
    const p = (await owner.post('/proyectos', { name: 'Con faltante' })).json.proyecto.id;
    const a = await subir(p, `/proyectos/${p}/archivos?nombre=perdido.png`, PNG);
    const blob = await prismaAdmin.blob.findUniqueOrThrow({ where: { id: a.versiones[0].blobId } });
    fs.rmSync(path.join(env.archivosDir, blob.storageKey));
    const r = await exportar(tokenOwner);
    expect(r.status).toBe(200);
    expect(r.entradas.get('LEEME.txt')!.toString()).toContain('Con faltante/archivos/perdido.png');
  });

  it('nadie más que el dueño: admin, miembro, cliente y soporte reciben 403', async () => {
    const staff = await prismaAdmin.user.create({ data: { email: `soporte-exp-${Date.now()}@lucuma.test`, name: 'Soporte', isStaff: true } });
    const admin = await prismaAdmin.user.create({ data: { email: `admin-exp-${Date.now()}@test.pe`, name: 'Admin' } });
    await unirACuenta(admin.id, A.accountId, 'admin');
    const quienes = [admin.id, A.memberId, A.clientId, staff.id];
    const estados = [];
    for (const id of quienes) estados.push((await exportar((await crearSesion(id)).token)).status);
    expect(estados).toEqual([403, 403, 403, 403]);
  });

  it('queda en el registro de seguridad', async () => {
    expect(await prismaAdmin.auditLog.count({ where: { accountId: A.accountId, action: 'cuenta.exportar', userId: A.ownerId } })).toBeGreaterThanOrEqual(1);
  });
});
