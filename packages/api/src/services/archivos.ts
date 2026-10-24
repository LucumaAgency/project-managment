/**
 * Archivos (D-46, D-52): carpetas (`folder`) y archivos (`upload`) con versiones. Los bytes van
 * al almacén (lib/almacen.ts, hoy el disco del servidor); la base guarda Blob (el archivo
 * físico) y UploadVersion (qué versión de qué archivo es).
 *
 * Subir se hace en tres pasos para no tener una transacción abierta mientras llegan los bytes:
 *   1. permiso y cupo (transacción corta);
 *   2. escribir en el almacén, fuera de la base;
 *   3. registrar Blob + archivo + versión + evento (transacción corta, revisa el cupo de nuevo).
 * Si el paso 3 falla, se borra lo escrito en el paso 2.
 */
import type { Readable } from 'node:stream';
import { planPermite } from '@lucuma-pm/shared';
import { esCliente } from '@lucuma-pm/shared';
import { almacen } from '../lib/almacen.js';
import { conCuenta, type Tx } from '../lib/contexto.js';
import { HttpError } from '../lib/errores.js';
import { planDeCuenta } from '../lib/plan.js';
import { nombreLimpio, seMuestraEnLinea, tipoReal } from '../lib/tipos-archivo.js';
import { env } from '../env.js';
import { crearElemento, elementoPara } from './elementos.js';
import { avisar, seguidoresComo } from './avisos.js';
import { registrarEvento } from './eventos.js';
import { exigir, puede, type Actor } from './permisos.js';
import { proyectoPara } from './proyectos.js';

/** Bytes en uso por la cuenta: archivos listos (las versiones viejas también cuentan). */
async function usoDeCuenta(tx: Tx, accountId: string) {
  const r = await tx.blob.aggregate({ where: { accountId, status: 'ready' }, _sum: { byteSize: true } });
  return Number(r._sum.byteSize ?? 0n);
}

async function exigirCupo(tx: Tx, accountId: string, nuevos: number) {
  const plan = await planDeCuenta(tx, accountId);
  if (plan.maxAlmacenamientoBytes === null) return;
  const r = planPermite(plan, { recurso: 'almacenamiento', actuales: await usoDeCuenta(tx, accountId), nuevos });
  if (!r.ok) throw new HttpError(403, r.motivo);
}

/** Escribe en el almacén y, si lo que sigue falla, lo borra. */
async function conBytes<T>(actor: Actor, entrada: Readable, nombre: string, registrar: (g: { clave: string; bytes: number; sha256: string; tipo: string; nombre: string }) => Promise<T>) {
  const limpio = nombreLimpio(nombre);
  const g = await almacen().guardar(actor.ctx.accountId, entrada, env.archivosMaxBytes);
  try {
    return await registrar({ clave: g.clave, bytes: g.bytes, sha256: g.sha256, tipo: tipoReal(g.cabecera, limpio), nombre: limpio });
  } catch (e) {
    await almacen().borrar(g.clave).catch(() => {});
    throw e;
  }
}

async function crearBlob(tx: Tx, actor: Actor, g: { clave: string; bytes: number; sha256: string; tipo: string; nombre: string }) {
  await exigirCupo(tx, actor.ctx.accountId, g.bytes);
  return tx.blob.create({
    data: {
      accountId: actor.ctx.accountId,
      storageKey: g.clave,
      filename: g.nombre,
      contentType: g.tipo,
      byteSize: BigInt(g.bytes),
      checksum: g.sha256,
      status: 'ready',
      createdById: actor.ctx.userId,
    },
    select: { id: true },
  });
}

/** Sube un archivo nuevo a la raíz del proyecto o a una carpeta. */
export async function subirArchivo(
  actor: Actor,
  projectId: string,
  datos: { carpetaId: string | null; nombre: string; visibleToClients?: boolean },
  entrada: Readable
) {
  // 1. Permiso y cupo antes de recibir los bytes (no hacer esperar a quien no puede).
  await conCuenta(actor.ctx, async (tx) => {
    const proyecto = await proyectoPara(tx, actor, projectId, 'proyecto.ver');
    const carpeta = datos.carpetaId ? (await elementoPara(tx, actor, datos.carpetaId, 'elemento.ver')).elemento : undefined;
    if (carpeta && carpeta.type !== 'folder') throw new HttpError(400, 'Los archivos van en la raíz o en una carpeta.');
    exigir(actor, 'elemento.crear', { proyecto, elemento: carpeta, tipo: 'upload' }, 'Tu rol no puede subir archivos aquí.');
    await exigirCupo(tx, actor.ctx.accountId, 1);
  });

  // 2 y 3.
  const id = await conBytes(actor, entrada, datos.nombre, (g) =>
    conCuenta(actor.ctx, async (tx) => {
      const blob = await crearBlob(tx, actor, g);
      const archivo = await crearElemento(tx, actor, projectId, {
        type: 'upload',
        parentId: datos.carpetaId,
        title: g.nombre,
        visibleToClients: datos.visibleToClients,
      });
      await tx.uploadVersion.create({ data: { recordingId: archivo.id, blobId: blob.id, version: 1, uploadedById: actor.ctx.userId } });
      return archivo.id;
    })
  );
  return conCuenta(actor.ctx, (tx) => detalleArchivo(tx, actor, id));
}

/** Nueva versión de un archivo: la anterior queda en el historial. */
export async function nuevaVersion(actor: Actor, id: string, datos: { nombre: string; nota?: string }, entrada: Readable) {
  await conCuenta(actor.ctx, async (tx) => {
    const { elemento } = await elementoPara(tx, actor, id, 'elemento.editar', 'No puedes subir versiones de este archivo.');
    if (elemento.type !== 'upload') throw new HttpError(404, 'No encontrado.');
    await exigirCupo(tx, actor.ctx.accountId, 1);
  });
  await conBytes(actor, entrada, datos.nombre, (g) =>
    conCuenta(actor.ctx, async (tx) => {
      const { proyecto, elemento } = await elementoPara(tx, actor, id, 'elemento.editar', 'No puedes subir versiones de este archivo.');
      const blob = await crearBlob(tx, actor, g);
      const ultima = await tx.uploadVersion.aggregate({ where: { recordingId: id }, _max: { version: true } });
      const version = (ultima._max.version ?? 0) + 1;
      await tx.uploadVersion.create({ data: { recordingId: id, blobId: blob.id, version, uploadedById: actor.ctx.userId, note: datos.nota?.slice(0, 500) || null } });
      // El título sigue al último nombre subido, salvo que lo hayan renombrado a mano antes.
      await tx.recording.update({ where: { id }, data: { title: g.nombre } });
      const eventId = await registrarEvento(tx, {
        accountId: actor.ctx.accountId,
        projectId: proyecto.id,
        recordingId: id,
        actorId: actor.ctx.userId,
        action: 'version_uploaded',
        details: { version },
        visibleToClients: elemento.visibleEnCadena,
      });
      await avisar(tx, {
        accountId: actor.ctx.accountId,
        eventId,
        recordingId: id,
        actorId: actor.ctx.userId,
        visibleToClients: elemento.visibleEnCadena,
        destinatarios: await seguidoresComo(tx, id),
      });
    })
  );
  return conCuenta(actor.ctx, (tx) => detalleArchivo(tx, actor, id));
}

const VERSION = {
  version: true,
  note: true,
  createdAt: true,
  uploadedBy: { select: { id: true, name: true } },
  blob: { select: { id: true, filename: true, contentType: true, byteSize: true } },
} as const;

function aVersion(v: { version: number; note: string | null; createdAt: Date; uploadedBy: { id: string; name: string }; blob: { id: string; filename: string; contentType: string; byteSize: bigint } }) {
  return {
    version: v.version,
    nota: v.note,
    createdAt: v.createdAt,
    uploadedBy: v.uploadedBy,
    blobId: v.blob.id,
    filename: v.blob.filename,
    contentType: v.blob.contentType,
    bytes: Number(v.blob.byteSize),
    enLinea: seMuestraEnLinea(v.blob.contentType),
  };
}

/** Carpetas y archivos dentro de una carpeta (o de la raíz), con la ruta hasta ahí. */
export async function listarArchivos(tx: Tx, actor: Actor, projectId: string, carpetaId: string | null) {
  const proyecto = await proyectoPara(tx, actor, projectId, 'proyecto.ver');
  const carpeta = carpetaId ? await elementoPara(tx, actor, carpetaId, 'elemento.ver') : null;
  if (carpeta && carpeta.elemento.type !== 'folder') throw new HttpError(404, 'No encontrado.');
  if (carpeta && carpeta.elemento.status !== 'active') throw new HttpError(404, 'No encontrado.');

  const visibles = esCliente(actor.rol) ? { visibleToClients: true } : {};
  const hijos = await tx.recording.findMany({
    where: { projectId: proyecto.id, parentId: carpetaId, type: { in: ['folder', 'upload'] }, status: 'active', ...visibles },
    select: {
      id: true,
      type: true,
      title: true,
      visibleToClients: true,
      createdAt: true,
      updatedAt: true,
      creator: { select: { id: true, name: true } },
      versions: { select: VERSION, orderBy: { version: 'desc' }, take: 1 },
      _count: { select: { versions: true } },
    },
    orderBy: [{ type: 'asc' }, { title: 'asc' }],
  });
  const conteos = await tx.recording.groupBy({
    by: ['parentId'],
    where: { type: { in: ['comment', 'folder', 'upload'] }, status: 'active', parentId: { in: hijos.map((h) => h.id) }, ...visibles },
    _count: { _all: true },
  });
  const cuantos = new Map(conteos.map((c) => [c.parentId, c._count._all]));

  // Ruta de carpetas desde la raíz (migas de pan).
  const ruta: { id: string; title: string | null }[] = [];
  let actual = carpetaId;
  for (let i = 0; actual && i < 30; i++) {
    const c = await tx.recording.findUniqueOrThrow({ where: { id: actual }, select: { id: true, title: true, parentId: true } });
    ruta.unshift({ id: c.id, title: c.title });
    actual = c.parentId;
  }

  const uso = await usoDeCuenta(tx, actor.ctx.accountId);
  const plan = await planDeCuenta(tx, actor.ctx.accountId);
  return {
    ruta,
    // La carpeta abierta: si le llega al cliente y si quien mira puede cambiarlo.
    carpeta: carpeta
      ? {
          id: carpeta.elemento.id,
          visibleParaCliente: carpeta.elemento.visibleEnCadena,
          visibleToClients: (await tx.recording.findUniqueOrThrow({ where: { id: carpeta.elemento.id }, select: { visibleToClients: true } })).visibleToClients,
          cambiarVisibilidad: puede(actor, 'elemento.cambiarVisibilidad', { proyecto, elemento: carpeta.elemento }),
        }
      : null,
    carpetas: hijos
      .filter((h) => h.type === 'folder')
      .map((h) => ({ id: h.id, title: h.title, visibleToClients: h.visibleToClients, elementos: cuantos.get(h.id) ?? 0 })),
    archivos: hijos
      .filter((h) => h.type === 'upload' && h.versions[0])
      .map((h) => ({
        id: h.id,
        title: h.title,
        visibleToClients: h.visibleToClients,
        updatedAt: h.updatedAt,
        versiones: h._count.versions,
        comentarios: cuantos.get(h.id) ?? 0,
        actual: aVersion(h.versions[0]),
      })),
    permisos: {
      subir: puede(actor, 'elemento.crear', { proyecto, elemento: carpeta?.elemento, tipo: 'upload' }),
      crearCarpeta: puede(actor, 'elemento.crear', { proyecto, elemento: carpeta?.elemento, tipo: 'folder' }),
    },
    // El espacio de la cuenta es asunto de la agencia: el cliente solo ve el máximo por archivo.
    almacenamiento: esCliente(actor.rol)
      ? { usados: null, maximo: null, maxArchivo: env.archivosMaxBytes }
      : { usados: uso, maximo: plan.maxAlmacenamientoBytes, maxArchivo: env.archivosMaxBytes },
  };
}

export async function detalleArchivo(tx: Tx, actor: Actor, id: string) {
  const { proyecto, elemento } = await elementoPara(tx, actor, id, 'elemento.ver');
  if (elemento.type !== 'upload') throw new HttpError(404, 'No encontrado.');
  const fila = await tx.recording.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      title: true,
      parentId: true,
      visibleToClients: true,
      createdAt: true,
      creator: { select: { id: true, name: true } },
      versions: { select: VERSION, orderBy: { version: 'desc' } },
    },
  });
  return {
    archivo: {
      id: fila.id,
      title: fila.title,
      carpetaId: fila.parentId,
      visibleToClients: fila.visibleToClients,
      /** Le llega al cliente de verdad: él y su carpeta (con toda la cadena) son visibles. */
      visibleParaCliente: elemento.visibleEnCadena,
      createdAt: fila.createdAt,
      creator: fila.creator,
      versiones: fila.versions.map(aVersion),
    },
    permisos: {
      nuevaVersion: puede(actor, 'elemento.editar', { proyecto, elemento }),
      renombrar: puede(actor, 'elemento.editar', { proyecto, elemento }),
      papelera: puede(actor, 'elemento.papelera', { proyecto, elemento }),
      cambiarVisibilidad: puede(actor, 'elemento.cambiarVisibilidad', { proyecto, elemento }),
      mover: puede(actor, 'elemento.mover', { proyecto, elemento }),
    },
  };
}

/**
 * Un archivo físico para entregar: solo si es una versión de un archivo que la persona puede
 * ver (con toda su cadena: si la carpeta es interna, un cliente no lo baja ni con el enlace).
 */
export async function blobParaLeer(tx: Tx, actor: Actor, blobId: string) {
  const v = await tx.uploadVersion.findFirst({
    where: { blobId },
    select: { recordingId: true, blob: { select: { storageKey: true, filename: true, contentType: true, byteSize: true, status: true } } },
  });
  if (!v || v.blob.status !== 'ready') throw new HttpError(404, 'No encontrado.');
  await elementoPara(tx, actor, v.recordingId, 'elemento.ver');
  return v.blob;
}
