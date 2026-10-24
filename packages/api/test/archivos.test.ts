/** Día 10: archivos en el disco del servidor, versiones, carpetas, entrega segura y permisos. */
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
let B: Semilla;
let tokens: Record<string, string>;
let owner: Cliente;
let member: Cliente;
let client: Cliente;
let projectId: string;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('resto de un png de prueba')]);
const PDF = Buffer.from('%PDF-1.4\n% prueba\n');

function subir(quien: 'owner' | 'member' | 'client', url: string, cuerpo: Buffer, cuenta = A.slug) {
  return app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: { cookie: `${COOKIE_SESION}=${tokens[quien]}`, 'x-cuenta': cuenta, 'content-type': 'application/octet-stream' },
    payload: cuerpo,
  });
}
function bajar(quien: 'owner' | 'member' | 'client', blobId: string, extra = '') {
  return app.inject({ url: `/api/v1/blobs/${blobId}/contenido${extra}`, headers: { cookie: `${COOKIE_SESION}=${tokens[quien]}`, 'x-cuenta': A.slug } });
}
const archivosEnDisco = () => (fs.existsSync(env.archivosDir) ? fs.readdirSync(env.archivosDir, { recursive: true }).filter((f) => !fs.statSync(`${env.archivosDir}/${f}`).isDirectory()) : []);

beforeAll(async () => {
  [A, B] = await Promise.all([sembrarCuenta('A'), sembrarCuenta('B')]);
  app = await buildApp({ logger: false, baseDomain: '' });
  tokens = {
    owner: (await crearSesion(A.ownerId)).token,
    member: (await crearSesion(A.memberId)).token,
    client: (await crearSesion(A.clientId)).token,
  };
  owner = cliente(app, tokens.owner, A.slug);
  member = cliente(app, tokens.member, A.slug);
  client = cliente(app, tokens.client, A.slug);
  projectId = (await owner.post('/proyectos', { name: 'Archivos' })).json.proyecto.id;
  for (const userId of [A.memberId, A.clientId]) await owner.post(`/proyectos/${projectId}/personas`, { userId });
});

afterAll(async () => {
  await app.close();
  await Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]);
  fs.rmSync(env.archivosDir, { recursive: true, force: true });
});

describe('subir y bajar', () => {
  it('sube una imagen: queda en disco con su huella y se ve en línea con encabezados seguros', async () => {
    const r = await subir('member', `/proyectos/${projectId}/archivos?nombre=${encodeURIComponent('logo final.png')}`, PNG);
    expect(r.statusCode, r.body).toBe(200);
    const { archivo, permisos } = r.json();
    expect(archivo).toMatchObject({ title: 'logo final.png', versiones: [{ version: 1, contentType: 'image/png', bytes: PNG.length, enLinea: true }] });
    expect(permisos).toMatchObject({ nuevaVersion: true, papelera: true });

    const blob = await prismaAdmin.blob.findUniqueOrThrow({ where: { id: archivo.versiones[0].blobId } });
    expect(blob.storageKey).toMatch(new RegExp(`^${A.accountId}/\\d{4}/\\d{2}/[0-9a-f]{32}$`)); // sin el nombre original
    expect(blob.checksum).toMatch(/^[0-9a-f]{64}$/);

    const b = await bajar('member', blob.id);
    expect(b.statusCode).toBe(200);
    expect(b.rawPayload.equals(PNG)).toBe(true);
    expect(b.headers['content-type']).toBe('image/png');
    expect(b.headers['content-disposition']).toMatch(/^inline; filename="logo final.png"; filename\*=UTF-8''logo%20final\.png$/);
    expect(b.headers['x-content-type-options']).toBe('nosniff');
    expect(b.headers['content-security-policy']).toContain('sandbox');
    expect((await bajar('member', blob.id, '?descargar=1')).headers['content-disposition']).toMatch(/^attachment/);
  });

  it('un HTML disfrazado de .png, o un SVG, nunca se muestra en línea: se descarga', async () => {
    for (const [nombre, cuerpo] of [
      ['falso.png', Buffer.from('<html><script>alert(1)</script></html>')],
      ['dibujo.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')],
      ['pagina.html', Buffer.from('<script>alert(1)</script>')],
    ] as const) {
      const r = await subir('member', `/proyectos/${projectId}/archivos?nombre=${nombre}`, cuerpo);
      const v = r.json().archivo.versiones[0];
      expect({ nombre, enLinea: v.enLinea }).toEqual({ nombre, enLinea: false });
      const b = await bajar('member', v.blobId);
      expect({ nombre, tipo: b.headers['content-type'], disp: String(b.headers['content-disposition']).split(';')[0] }).toEqual({
        nombre,
        tipo: 'application/octet-stream',
        disp: 'attachment',
      });
    }
  });

  it('un PDF se ve en línea (sin sandbox, para que el visor del navegador funcione)', async () => {
    const v = (await subir('member', `/proyectos/${projectId}/archivos?nombre=brief.pdf`, PDF)).json().archivo.versiones[0];
    const b = await bajar('member', v.blobId);
    expect(b.headers['content-type']).toBe('application/pdf');
    expect(b.headers['content-security-policy']).not.toContain('sandbox');
  });

  it('nombre con rutas o caracteres raros se limpia', async () => {
    const r = await subir('member', `/proyectos/${projectId}/archivos?nombre=${encodeURIComponent('../../etc/pass\u0000wd.txt')}`, Buffer.from('hola'));
    expect(r.json().archivo.title).toBe('passwd.txt');
  });

  it('archivo vacío: 400; más grande que el máximo: 413; en ambos casos no queda nada', async () => {
    const antesDisco = archivosEnDisco().length;
    const antesBlobs = await prismaAdmin.blob.count({ where: { accountId: A.accountId } });
    expect((await subir('member', `/proyectos/${projectId}/archivos?nombre=vacio.txt`, Buffer.alloc(0))).statusCode).toBe(400);
    const grande = await subir('member', `/proyectos/${projectId}/archivos?nombre=grande.bin`, Buffer.alloc(env.archivosMaxBytes + 10, 1));
    expect(grande.statusCode).toBe(413);
    // Sin Content-Length (envío por partes): se corta al pasar el máximo, igual 413 con mensaje.
    const { Readable } = await import('node:stream');
    const porPartes = await app.inject({
      method: 'POST',
      url: `/api/v1/proyectos/${projectId}/archivos?nombre=grande2.bin`,
      headers: { cookie: `${COOKIE_SESION}=${tokens.member}`, 'x-cuenta': A.slug, 'content-type': 'application/octet-stream' },
      payload: Readable.from([Buffer.alloc(env.archivosMaxBytes, 1), Buffer.alloc(1000, 1)]),
    });
    expect(porPartes.statusCode).toBe(413);
    expect(porPartes.json().error).toMatch(/supera el máximo/);
    expect(archivosEnDisco().length).toBe(antesDisco);
    expect(archivosEnDisco().some((f) => String(f).endsWith('.parcial'))).toBe(false);
    expect(await prismaAdmin.blob.count({ where: { accountId: A.accountId } })).toBe(antesBlobs);
  });

  it('respeta el espacio del plan', async () => {
    const C = await sembrarCuenta('C'); // la semilla trae un blob de 1024 bytes
    await prismaAdmin.account.update({ where: { id: C.accountId }, data: { limits: { maxAlmacenamientoBytes: 1100 } } });
    tokens.c = (await crearSesion(C.ownerId)).token;
    const p = (await cliente(app, tokens.c, C.slug).post('/proyectos', { name: 'Lleno' })).json.proyecto.id;
    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/proyectos/${p}/archivos?nombre=x.bin`,
      headers: { cookie: `${COOKIE_SESION}=${tokens.c}`, 'x-cuenta': C.slug, 'content-type': 'application/octet-stream' },
      payload: Buffer.alloc(200, 1),
    });
    expect(r.statusCode).toBe(403);
  });
});

describe('versiones y carpetas', () => {
  it('nueva versión: la anterior queda bajable; el listado muestra la última', async () => {
    const a = (await subir('member', `/proyectos/${projectId}/archivos?nombre=propuesta.pdf`, PDF)).json().archivo;
    const v2 = await subir('owner', `/archivos/${a.id}/versiones?nombre=propuesta-v2.pdf&nota=${encodeURIComponent('con cambios del cliente')}`, Buffer.concat([PDF, Buffer.from('v2')]));
    expect(v2.statusCode).toBe(200);
    const vs = v2.json().archivo.versiones;
    expect(vs.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(vs[0]).toMatchObject({ nota: 'con cambios del cliente', filename: 'propuesta-v2.pdf' });
    expect((await bajar('member', vs[1].blobId)).statusCode).toBe(200);
    expect(await prismaAdmin.event.count({ where: { recordingId: a.id, action: 'version_uploaded' } })).toBe(1);

    const listado = (await member.get(`/proyectos/${projectId}/archivos`)).json;
    expect(listado.archivos.find((x: { id: string }) => x.id === a.id)).toMatchObject({ title: 'propuesta-v2.pdf', versiones: 2, actual: { version: 2 } });
  });

  it('carpetas: crear, subir adentro, listar con la ruta; un archivo no va dentro de una tarea', async () => {
    const c1 = (await member.post(`/proyectos/${projectId}/elementos`, { type: 'folder', title: 'Entregables' })).json.elemento.id;
    const c2 = (await member.post(`/proyectos/${projectId}/elementos`, { type: 'folder', title: 'Semana 1', parentId: c1 })).json.elemento.id;
    await subir('member', `/proyectos/${projectId}/archivos?nombre=foto.png&carpeta=${c2}`, PNG);
    const r = (await member.get(`/proyectos/${projectId}/archivos?carpeta=${c2}`)).json;
    expect(r.ruta.map((x: { title: string }) => x.title)).toEqual(['Entregables', 'Semana 1']);
    expect(r.archivos.map((x: { title: string }) => x.title)).toEqual(['foto.png']);
    const raiz = (await member.get(`/proyectos/${projectId}/archivos`)).json;
    expect(raiz.carpetas.find((x: { id: string }) => x.id === c1).elementos).toBe(1);

    const lista = (await member.post(`/proyectos/${projectId}/listas`, { title: 'L' })).json.lista.id;
    const t = (await member.post(`/listas/${lista}/tareas`, { title: 'T' })).json.tarea.id;
    expect((await subir('member', `/proyectos/${projectId}/archivos?nombre=x.png&carpeta=${t}`, PNG)).statusCode).toBe(400);
  });

  it('se comenta un archivo', async () => {
    const a = (await subir('member', `/proyectos/${projectId}/archivos?nombre=com.png`, PNG)).json().archivo.id;
    const c = await member.post(`/elementos/${a}/comentarios`, { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'me gusta' }] }] } });
    expect(c.status).toBe(200);
  });
});

describe('lo que ve y hace un cliente', () => {
  it('no lista ni baja lo de una carpeta interna, ni con el enlace directo', async () => {
    const interna = (await member.post(`/proyectos/${projectId}/elementos`, { type: 'folder', title: 'Interna' })).json.elemento.id;
    // Archivo marcado visible, pero dentro de una carpeta interna: no se ve (la cadena manda).
    const v = (await subir('member', `/proyectos/${projectId}/archivos?nombre=secreto.pdf&carpeta=${interna}&visible=1`, PDF)).json().archivo.versiones[0];
    expect((await client.get(`/proyectos/${projectId}/archivos?carpeta=${interna}`)).status).toBe(404);
    expect((await bajar('client', v.blobId)).statusCode).toBe(404);
  });

  it('en una carpeta visible baja lo visible y sube (nace visible)', async () => {
    const visible = (await member.post(`/proyectos/${projectId}/elementos`, { type: 'folder', title: 'Para el cliente', visibleToClients: true })).json.elemento.id;
    const v = (await subir('member', `/proyectos/${projectId}/archivos?nombre=entrega.pdf&carpeta=${visible}&visible=1`, PDF)).json().archivo.versiones[0];
    expect((await bajar('client', v.blobId)).statusCode).toBe(200);
    const suyo = await subir('client', `/proyectos/${projectId}/archivos?nombre=referencia.png&carpeta=${visible}`, PNG);
    expect(suyo.statusCode).toBe(200);
    expect(suyo.json().archivo.visibleToClients).toBe(true);
    const r = (await client.get(`/proyectos/${projectId}/archivos?carpeta=${visible}`)).json;
    expect(r.archivos.map((x: { title: string }) => x.title).sort()).toEqual(['entrega.pdf', 'referencia.png']);
    expect(r.permisos.crearCarpeta).toBe(false);
    // Un cliente no sube versiones de lo ajeno.
    expect((await subir('client', `/archivos/${(r.archivos.find((x: { title: string }) => x.title === 'entrega.pdf')).id}/versiones?nombre=x.pdf`, PDF)).statusCode).toBe(403);
  });

  it('otra cuenta no baja nada (404)', async () => {
    const v = (await subir('member', `/proyectos/${projectId}/archivos?nombre=privado.png`, PNG)).json().archivo.versiones[0];
    const ownerB = (await crearSesion(B.ownerId)).token;
    const r = await app.inject({ url: `/api/v1/blobs/${v.blobId}/contenido`, headers: { cookie: `${COOKIE_SESION}=${ownerB}`, 'x-cuenta': B.slug } });
    expect(r.statusCode).toBe(404);
    const sinSesion = await app.inject({ url: `/api/v1/blobs/${v.blobId}/contenido`, headers: { 'x-cuenta': A.slug } });
    expect(sinSesion.statusCode).toBe(401);
  });
});
