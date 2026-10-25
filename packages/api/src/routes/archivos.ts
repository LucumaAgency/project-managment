import type { Readable } from 'node:stream';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { env } from '../env.js';
import { HttpError } from '../lib/errores.js';
import { z } from 'zod';
import { almacen } from '../lib/almacen.js';
import { conCuenta } from '../lib/contexto.js';
import { seMuestraEnLinea } from '../lib/tipos-archivo.js';
import { leer } from '../lib/validar.js';
import { blobParaLeer, detalleArchivo, listarArchivos, nuevaVersion, subirArchivo } from '../services/archivos.js';
import { exigirCuenta } from '../plugins/contexto.js';
import { subirArchivoCampo } from '../services/campos.js';
import { completarPorRespuestas, tareaDetalle } from '../services/tareas.js';

/**
 * Archivos. Subir: el cuerpo de la petición ES el archivo (Content-Type application/
 * octet-stream) y el nombre va en ?nombre=. Sin multipart y sin dependencias nuevas. Carpetas,
 * renombrar, mover, papelera, visibilidad y comentarios usan las rutas genéricas de elementos.
 */
const id = z.string().min(1).max(40);
const subida = z.object({
  nombre: z.string().min(1, 'Falta el nombre del archivo.').max(255),
  carpeta: id.optional(),
  visible: z.enum(['0', '1']).optional(),
});
const version = z.object({ nombre: z.string().min(1).max(255), nota: z.string().max(500).optional() });
const listado = z.object({ carpeta: id.optional() });
const contenido = z.object({ descargar: z.enum(['0', '1']).optional() });

/** Nombre para Content-Disposition: ASCII simple + la forma UTF-8 (RFC 5987). */
function disposicion(tipo: 'inline' | 'attachment', nombre: string) {
  const ascii = nombre.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

/** Si el navegador ya avisa que es más grande que el máximo, no se lee nada. */
function exigirTamano(req: FastifyRequest) {
  const largo = Number(req.headers['content-length'] ?? 0);
  if (largo > env.archivosMaxBytes) {
    throw new HttpError(413, `El archivo supera el máximo de ${Math.round(env.archivosMaxBytes / 1024 / 1024)} MB.`);
  }
}

export default async function rutasArchivos(app: FastifyInstance) {
  // El cuerpo binario llega como flujo, sin leerlo entero en memoria. El tamaño lo corta el
  // almacén (ARCHIVOS_MAX_MB). Un formulario de otro sitio no puede mandar este tipo sin
  // preflight, así que no abre un hueco de CSRF.
  app.addContentTypeParser('application/octet-stream', (_req, cuerpo, listo) => listo(null, cuerpo));

  app.post<{ Params: { id: string } }>('/api/v1/proyectos/:id/archivos', async (req) => {
    const actor = exigirCuenta(req);
    exigirTamano(req);
    const q = leer(subida, req.query);
    return subirArchivo(actor, req.params.id, { carpetaId: q.carpeta ?? null, nombre: q.nombre, visibleToClients: q.visible === '1' }, req.body as Readable);
  });

  app.post<{ Params: { id: string } }>('/api/v1/archivos/:id/versiones', async (req) => {
    const actor = exigirCuenta(req);
    exigirTamano(req);
    const q = leer(version, req.query);
    return nuevaVersion(actor, req.params.id, q, req.body as Readable);
  });

  app.get<{ Params: { id: string } }>('/api/v1/proyectos/:id/archivos', async (req) => {
    const actor = exigirCuenta(req);
    const q = leer(listado, req.query);
    return conCuenta(actor.ctx, (tx) => listarArchivos(tx, actor, req.params.id, q.carpeta ?? null));
  });

  app.get<{ Params: { id: string } }>('/api/v1/archivos/:id', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, (tx) => detalleArchivo(tx, actor, req.params.id));
  });

  /**
   * Entrega un archivo. Imágenes y PDF reconocidos por su firma se muestran en el navegador;
   * todo lo demás se descarga (nunca HTML ni SVG en línea). nosniff para que el navegador no
   * adivine otro tipo, y una política de contenido cerrada.
   */
  app.get<{ Params: { id: string } }>('/api/v1/blobs/:id/contenido', async (req, reply) => {
    const actor = exigirCuenta(req);
    const q = leer(contenido, req.query);
    const blob = await conCuenta(actor.ctx, (tx) => blobParaLeer(tx, actor, req.params.id));
    const enLinea = seMuestraEnLinea(blob.contentType) && q.descargar !== '1';
    reply
      .header('Content-Type', enLinea ? blob.contentType : 'application/octet-stream')
      .header('Content-Length', String(blob.byteSize))
      .header('Content-Disposition', disposicion(enLinea ? 'inline' : 'attachment', blob.filename))
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', blob.contentType === 'application/pdf' ? "default-src 'none'; object-src 'self'" : "default-src 'none'; img-src 'self'; sandbox")
      // El contenido de un blob no cambia nunca (una versión nueva es otro blob).
      .header('Cache-Control', 'private, max-age=86400');
    return reply.send(almacen().leer(blob.storageKey));
  });

  /** Subir un archivo a un campo de tipo archivo (el cuerpo ES el archivo, como en Archivos). */
  app.post<{ Params: { id: string; campo: string } }>('/api/v1/tareas/:id/campos/:campo/archivos', async (req) => {
    const actor = exigirCuenta(req);
    exigirTamano(req);
    const q = leer(version.pick({ nombre: true }), req.query);
    const r = await subirArchivoCampo(actor, req.params.id, req.params.campo, q.nombre, req.body as Readable, completarPorRespuestas);
    return { ...r, ...(await conCuenta(actor.ctx, (tx) => tareaDetalle(tx, actor, req.params.id))) };
  });
}
