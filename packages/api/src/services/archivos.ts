/**
 * Archivos (D-46, D-52): carpetas (`folder`), archivos (`upload`) con versiones, enlaces (`link`,
 * D-78) a archivos que viven afuera (Drive, Previews…) y documentos en Markdown (`doc`, D-82)
 * que se escriben y leen en la app. Los bytes van
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
import { markdownAHtml, MAX_DOCUMENTO } from '@lucuma-pm/shared/markdown';
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
/** Dominio para mostrar junto al enlace ("drive.google.com"), sin www. */
export function sitioDe(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function usoDeCuenta(tx: Tx, accountId: string) {
  const r = await tx.blob.aggregate({ where: { accountId, status: 'ready' }, _sum: { byteSize: true } });
  return Number(r._sum.byteSize ?? 0n);
}

export async function exigirCupo(tx: Tx, accountId: string, nuevos: number) {
  const plan = await planDeCuenta(tx, accountId);
  if (plan.maxAlmacenamientoBytes === null) return;
  const r = planPermite(plan, { recurso: 'almacenamiento', actuales: await usoDeCuenta(tx, accountId), nuevos });
  if (!r.ok) throw new HttpError(403, r.motivo);
}

/** Escribe en el almacén y, si lo que sigue falla, lo borra. */
export async function conBytes<T>(actor: Actor, entrada: Readable, nombre: string, registrar: (g: { clave: string; bytes: number; sha256: string; tipo: string; nombre: string }) => Promise<T>) {
  const limpio = nombreLimpio(nombre);
  const g = await almacen().guardar(actor.ctx.accountId, entrada, env.archivosMaxBytes);
  try {
    return await registrar({ clave: g.clave, bytes: g.bytes, sha256: g.sha256, tipo: tipoReal(g.cabecera, limpio), nombre: limpio });
  } catch (e) {
    await almacen().borrar(g.clave).catch(() => {});
    throw e;
  }
}

export async function crearBlob(tx: Tx, actor: Actor, g: { clave: string; bytes: number; sha256: string; tipo: string; nombre: string }) {
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

/**
 * Dirección de un enlace: solo http y https (nunca javascript:, data: ni nada que el navegador
 * ejecute), sin espacios y con un máximo razonable. Devuelve la dirección normalizada.
 */
export function urlValida(entrada: string) {
  const texto = entrada.trim();
  let u: URL;
  try {
    u = new URL(texto);
  } catch {
    throw new HttpError(400, 'La dirección no es válida. Copia el enlace completo, con https://');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new HttpError(400, 'Solo se aceptan enlaces http o https.');
  if (!u.hostname) throw new HttpError(400, 'La dirección no es válida.');
  const final = u.toString();
  if (final.length > 2000) throw new HttpError(400, 'La dirección es demasiado larga.');
  return final;
}

/** Agrega un enlace a la raíz del proyecto o a una carpeta. Mismos permisos que subir un archivo. */
export async function crearEnlace(
  actor: Actor,
  projectId: string,
  datos: { carpetaId: string | null; titulo: string; url: string; visibleToClients?: boolean }
) {
  const url = urlValida(datos.url);
  const id = await conCuenta(actor.ctx, async (tx) => {
    const carpeta = datos.carpetaId ? (await elementoPara(tx, actor, datos.carpetaId, 'elemento.ver')).elemento : undefined;
    if (carpeta && carpeta.type !== 'folder') throw new HttpError(400, 'Los enlaces van en la raíz o en una carpeta.');
    const enlace = await crearElemento(tx, actor, projectId, {
      type: 'link',
      parentId: datos.carpetaId,
      title: datos.titulo,
      visibleToClients: datos.visibleToClients,
    });
    await tx.recording.update({ where: { id: enlace.id }, data: { url } });
    return enlace.id;
  });
  return conCuenta(actor.ctx, (tx) => detalleArchivo(tx, actor, id));
}

/** Cambia la dirección de un enlace (el nombre se cambia con la ruta genérica de elementos). */
export async function cambiarEnlace(actor: Actor, id: string, nueva: string) {
  const url = urlValida(nueva);
  await conCuenta(actor.ctx, async (tx) => {
    const { proyecto, elemento } = await elementoPara(tx, actor, id, 'elemento.editar', 'No puedes cambiar este enlace.');
    if (elemento.type !== 'link') throw new HttpError(404, 'No encontrado.');
    await tx.recording.update({ where: { id }, data: { url } });
    await registrarEvento(tx, {
      accountId: actor.ctx.accountId,
      projectId: proyecto.id,
      recordingId: id,
      actorId: actor.ctx.userId,
      action: 'updated',
      visibleToClients: elemento.visibleEnCadena,
    });
  });
  return conCuenta(actor.ctx, (tx) => detalleArchivo(tx, actor, id));
}

/** Texto de un documento: se guarda tal cual (fuente) y su HTML armado con la misma regla de la web. */
function textoDocumento(markdown: string) {
  const texto = markdown.replace(/\r\n?/g, '\n');
  if (texto.length > MAX_DOCUMENTO) throw new HttpError(400, `El documento es demasiado largo (máximo ${MAX_DOCUMENTO.toLocaleString('es-PE')} caracteres).`);
  return { bodyText: texto, bodyHtml: markdownAHtml(texto) };
}

/** Crea un documento en Markdown (D-82) en la raíz o en una carpeta. Mismos permisos que subir un archivo. */
export async function crearDocumento(
  actor: Actor,
  projectId: string,
  datos: { carpetaId: string | null; titulo: string; contenido?: string; visibleToClients?: boolean }
) {
  const cuerpo = textoDocumento(datos.contenido ?? '');
  const id = await conCuenta(actor.ctx, async (tx) => {
    const carpeta = datos.carpetaId ? (await elementoPara(tx, actor, datos.carpetaId, 'elemento.ver')).elemento : undefined;
    if (carpeta && carpeta.type !== 'folder') throw new HttpError(400, 'Los documentos van en la raíz o en una carpeta.');
    const doc = await crearElemento(tx, actor, projectId, {
      type: 'doc',
      parentId: datos.carpetaId,
      title: datos.titulo,
      visibleToClients: datos.visibleToClients,
    });
    await tx.recording.update({ where: { id: doc.id }, data: cuerpo });
    return doc.id;
  });
  return conCuenta(actor.ctx, (tx) => detalleArchivo(tx, actor, id));
}

/**
 * Guarda el texto de un documento. `base` es la fecha de la versión que la persona abrió: si
 * otra persona guardó en el medio, responde 409 en vez de pisar su cambio sin avisar.
 */
export async function guardarDocumento(actor: Actor, id: string, datos: { contenido: string; base?: string }) {
  const cuerpo = textoDocumento(datos.contenido);
  await conCuenta(actor.ctx, async (tx) => {
    const { proyecto, elemento } = await elementoPara(tx, actor, id, 'elemento.editar', 'No puedes editar este documento.');
    if (elemento.type !== 'doc') throw new HttpError(404, 'No encontrado.');
    const actual = await tx.recording.findUniqueOrThrow({ where: { id }, select: { bodyText: true, updatedAt: true } });
    if (actual.bodyText === cuerpo.bodyText) return;
    if (datos.base && new Date(datos.base).getTime() !== actual.updatedAt.getTime()) {
      throw new HttpError(409, 'Alguien cambió este documento mientras lo editabas. Copia tu texto, recarga la página y vuelve a aplicar tus cambios.');
    }
    await tx.recording.update({ where: { id }, data: cuerpo });
    await registrarEvento(tx, {
      accountId: actor.ctx.accountId,
      projectId: proyecto.id,
      recordingId: id,
      actorId: actor.ctx.userId,
      action: 'updated',
      visibleToClients: elemento.visibleEnCadena,
    });
  });
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
    where: { projectId: proyecto.id, parentId: carpetaId, type: { in: ['folder', 'upload', 'link', 'doc'] }, status: 'active', ...visibles },
    select: {
      id: true,
      type: true,
      title: true,
      url: true,
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
    where: { type: { in: ['comment', 'folder', 'upload', 'link', 'doc'] }, status: 'active', parentId: { in: hijos.map((h) => h.id) }, ...visibles },
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
    enlaces: hijos
      .filter((h) => h.type === 'link' && h.url)
      .map((h) => ({
        id: h.id,
        title: h.title,
        url: h.url!,
        sitio: sitioDe(h.url!),
        visibleToClients: h.visibleToClients,
        updatedAt: h.updatedAt,
        comentarios: cuantos.get(h.id) ?? 0,
        creator: h.creator,
      })),
    documentos: hijos
      .filter((h) => h.type === 'doc')
      .map((h) => ({
        id: h.id,
        title: h.title,
        visibleToClients: h.visibleToClients,
        updatedAt: h.updatedAt,
        comentarios: cuantos.get(h.id) ?? 0,
        creator: h.creator,
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
  if (elemento.type !== 'upload' && elemento.type !== 'link' && elemento.type !== 'doc') throw new HttpError(404, 'No encontrado.');
  const fila = await tx.recording.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      title: true,
      url: true,
      bodyText: true,
      bodyHtml: true,
      parentId: true,
      visibleToClients: true,
      createdAt: true,
      updatedAt: true,
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
      /** Solo en enlaces (D-78): adónde lleva. En un archivo, null. */
      enlace: elemento.type === 'link' && fila.url ? { url: fila.url, sitio: sitioDe(fila.url) } : null,
      /** Solo en documentos (D-82): el Markdown (fuente), su HTML y cuándo se guardó (para no pisar cambios). */
      documento: elemento.type === 'doc' ? { markdown: fila.bodyText ?? '', html: fila.bodyHtml ?? '', updatedAt: fila.updatedAt } : null,
    },
    permisos: {
      nuevaVersion: elemento.type === 'upload' && puede(actor, 'elemento.editar', { proyecto, elemento }),
      cambiarEnlace: elemento.type === 'link' && puede(actor, 'elemento.editar', { proyecto, elemento }),
      editarDocumento: elemento.type === 'doc' && puede(actor, 'elemento.editar', { proyecto, elemento }),
      renombrar: puede(actor, 'elemento.editar', { proyecto, elemento }),
      papelera: puede(actor, 'elemento.papelera', { proyecto, elemento }),
      cambiarVisibilidad: puede(actor, 'elemento.cambiarVisibilidad', { proyecto, elemento }),
      mover: puede(actor, 'elemento.mover', { proyecto, elemento }),
    },
  };
}

/**
 * Un archivo físico para entregar: solo si es una versión de un archivo (o el adjunto de una
 * respuesta) que la persona puede ver (con toda su cadena: si la carpeta es interna, un cliente no lo baja ni con el enlace).
 */
export async function blobParaLeer(tx: Tx, actor: Actor, blobId: string) {
  const v = await tx.uploadVersion.findFirst({
    where: { blobId },
    select: { recordingId: true, blob: { select: { storageKey: true, filename: true, contentType: true, byteSize: true, status: true } } },
  });
  if (v) {
    if (v.blob.status !== 'ready') throw new HttpError(404, 'No encontrado.');
    await elementoPara(tx, actor, v.recordingId, 'elemento.ver');
    return v.blob;
  }
  // Archivo de una respuesta (D-65): se ve si se ve la tarea de la que cuelga.
  const a = await tx.recordingAttachment.findFirst({
    where: { blobId },
    select: { recordingId: true, blob: { select: { storageKey: true, filename: true, contentType: true, byteSize: true, status: true } } },
  });
  if (!a || a.blob.status !== 'ready') throw new HttpError(404, 'No encontrado.');
  await elementoPara(tx, actor, a.recordingId, 'elemento.ver');
  return a.blob;
}
