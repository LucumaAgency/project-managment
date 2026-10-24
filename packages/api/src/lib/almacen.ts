/**
 * Dónde viven los bytes de los archivos. Una interfaz chica para que pasar a R2 (u otro) sea
 * escribir otra implementación, sin tocar rutas ni servicios (D-46).
 *
 * Disco: <archivosDir>/<accountId>/<aaaa>/<mm>/<id>. La clave nunca lleva el nombre original
 * (puede traer datos personales o caracteres raros). Se escribe a un .parcial y se renombra al
 * terminar: si la subida se corta, no queda un archivo a medias con nombre definitivo.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { env } from '../env.js';
import { HttpError } from './errores.js';

export interface Guardado {
  clave: string;
  bytes: number;
  sha256: string;
  /** Los primeros bytes, para reconocer el tipo real (lib/tipos-archivo.ts). */
  cabecera: Buffer;
}

export interface Almacen {
  guardar(accountId: string, entrada: Readable, maxBytes: number): Promise<Guardado>;
  leer(clave: string): Readable;
  borrar(clave: string): Promise<void>;
  existe(clave: string): Promise<boolean>;
}

const CABECERA = 32;

export function almacenEnDisco(raiz: string): Almacen {
  const ruta = (clave: string) => {
    const p = path.resolve(raiz, clave);
    // La clave la arma el servidor, pero igual: nunca salir de la carpeta raíz.
    if (!p.startsWith(path.resolve(raiz) + path.sep)) throw new Error('Clave de archivo inválida.');
    return p;
  };
  return {
    async guardar(accountId, entrada, maxBytes) {
      const hoy = new Date();
      const clave = [accountId, String(hoy.getUTCFullYear()), String(hoy.getUTCMonth() + 1).padStart(2, '0'), randomBytes(16).toString('hex')].join('/');
      const destino = ruta(clave);
      const parcial = `${destino}.parcial`;
      await fs.mkdir(path.dirname(destino), { recursive: true });

      let bytes = 0;
      let excedido = false;
      let cabecera = Buffer.alloc(0);
      const hash = createHash('sha256');
      // Si se pasa del máximo, deja de escribir pero sigue leyendo (y descartando) hasta el
      // final: cortar la entrada a la mitad cerraría la conexión y el navegador no recibiría
      // el 413 con su mensaje. El tope duro lo pone nginx (client_max_body_size).
      const contar = new Transform({
        transform(trozo: Buffer, _cod, listo) {
          bytes += trozo.length;
          if (excedido || bytes > maxBytes) {
            excedido = true;
            return listo();
          }
          if (cabecera.length < CABECERA) cabecera = Buffer.concat([cabecera, trozo.subarray(0, CABECERA - cabecera.length)]);
          hash.update(trozo);
          listo(null, trozo);
        },
      });
      try {
        await pipeline(entrada, contar, createWriteStream(parcial, { flags: 'wx' }));
        if (excedido) throw new HttpError(413, `El archivo supera el máximo de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
        if (bytes === 0) throw new HttpError(400, 'El archivo está vacío.');
        await fs.rename(parcial, destino);
      } catch (e) {
        await fs.rm(parcial, { force: true });
        throw e;
      }
      return { clave, bytes, sha256: hash.digest('hex'), cabecera };
    },
    leer: (clave) => createReadStream(ruta(clave)),
    borrar: async (clave) => {
      await fs.rm(ruta(clave), { force: true });
    },
    existe: (clave) =>
      fs.access(ruta(clave)).then(
        () => true,
        () => false
      ),
  };
}

let actual: Almacen | null = null;
/** El almacén en uso (en disco, en la carpeta de la configuración). */
export const almacen = () => (actual ??= almacenEnDisco(env.archivosDir));
