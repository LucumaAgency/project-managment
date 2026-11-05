/**
 * Archivos (D-46, D-52): carpetas (`folder`), archivos (`upload`) con versiones y enlaces (`link`,
 * D-78) a archivos que viven afuera (Drive, Previews…). Los bytes van
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
import { type Tx } from '../lib/contexto.js';
import { type Actor } from './permisos.js';
/** Bytes en uso por la cuenta: archivos listos (las versiones viejas también cuentan). */
/** Dominio para mostrar junto al enlace ("drive.google.com"), sin www. */
export declare function sitioDe(url: string): string;
export declare function exigirCupo(tx: Tx, accountId: string, nuevos: number): Promise<void>;
/** Escribe en el almacén y, si lo que sigue falla, lo borra. */
export declare function conBytes<T>(actor: Actor, entrada: Readable, nombre: string, registrar: (g: {
    clave: string;
    bytes: number;
    sha256: string;
    tipo: string;
    nombre: string;
}) => Promise<T>): Promise<T>;
export declare function crearBlob(tx: Tx, actor: Actor, g: {
    clave: string;
    bytes: number;
    sha256: string;
    tipo: string;
    nombre: string;
}): Promise<{
    id: string;
}>;
/** Sube un archivo nuevo a la raíz del proyecto o a una carpeta. */
export declare function subirArchivo(actor: Actor, projectId: string, datos: {
    carpetaId: string | null;
    nombre: string;
    visibleToClients?: boolean;
}, entrada: Readable): Promise<{
    archivo: {
        id: string;
        title: string | null;
        carpetaId: string | null;
        visibleToClients: boolean;
        /** Le llega al cliente de verdad: él y su carpeta (con toda la cadena) son visibles. */
        visibleParaCliente: boolean;
        createdAt: Date;
        creator: {
            name: string;
            id: string;
        };
        versiones: {
            version: number;
            nota: string | null;
            createdAt: Date;
            uploadedBy: {
                id: string;
                name: string;
            };
            blobId: string;
            filename: string;
            contentType: string;
            bytes: number;
            enLinea: boolean;
        }[];
        /** Solo en enlaces (D-78): adónde lleva. En un archivo, null. */
        enlace: {
            url: string;
            sitio: string;
        } | null;
    };
    permisos: {
        nuevaVersion: boolean;
        cambiarEnlace: boolean;
        renombrar: boolean;
        papelera: boolean;
        cambiarVisibilidad: boolean;
        mover: boolean;
    };
}>;
/** Nueva versión de un archivo: la anterior queda en el historial. */
export declare function nuevaVersion(actor: Actor, id: string, datos: {
    nombre: string;
    nota?: string;
}, entrada: Readable): Promise<{
    archivo: {
        id: string;
        title: string | null;
        carpetaId: string | null;
        visibleToClients: boolean;
        /** Le llega al cliente de verdad: él y su carpeta (con toda la cadena) son visibles. */
        visibleParaCliente: boolean;
        createdAt: Date;
        creator: {
            name: string;
            id: string;
        };
        versiones: {
            version: number;
            nota: string | null;
            createdAt: Date;
            uploadedBy: {
                id: string;
                name: string;
            };
            blobId: string;
            filename: string;
            contentType: string;
            bytes: number;
            enLinea: boolean;
        }[];
        /** Solo en enlaces (D-78): adónde lleva. En un archivo, null. */
        enlace: {
            url: string;
            sitio: string;
        } | null;
    };
    permisos: {
        nuevaVersion: boolean;
        cambiarEnlace: boolean;
        renombrar: boolean;
        papelera: boolean;
        cambiarVisibilidad: boolean;
        mover: boolean;
    };
}>;
/**
 * Dirección de un enlace: solo http y https (nunca javascript:, data: ni nada que el navegador
 * ejecute), sin espacios y con un máximo razonable. Devuelve la dirección normalizada.
 */
export declare function urlValida(entrada: string): string;
/** Agrega un enlace a la raíz del proyecto o a una carpeta. Mismos permisos que subir un archivo. */
export declare function crearEnlace(actor: Actor, projectId: string, datos: {
    carpetaId: string | null;
    titulo: string;
    url: string;
    visibleToClients?: boolean;
}): Promise<{
    archivo: {
        id: string;
        title: string | null;
        carpetaId: string | null;
        visibleToClients: boolean;
        /** Le llega al cliente de verdad: él y su carpeta (con toda la cadena) son visibles. */
        visibleParaCliente: boolean;
        createdAt: Date;
        creator: {
            name: string;
            id: string;
        };
        versiones: {
            version: number;
            nota: string | null;
            createdAt: Date;
            uploadedBy: {
                id: string;
                name: string;
            };
            blobId: string;
            filename: string;
            contentType: string;
            bytes: number;
            enLinea: boolean;
        }[];
        /** Solo en enlaces (D-78): adónde lleva. En un archivo, null. */
        enlace: {
            url: string;
            sitio: string;
        } | null;
    };
    permisos: {
        nuevaVersion: boolean;
        cambiarEnlace: boolean;
        renombrar: boolean;
        papelera: boolean;
        cambiarVisibilidad: boolean;
        mover: boolean;
    };
}>;
/** Cambia la dirección de un enlace (el nombre se cambia con la ruta genérica de elementos). */
export declare function cambiarEnlace(actor: Actor, id: string, nueva: string): Promise<{
    archivo: {
        id: string;
        title: string | null;
        carpetaId: string | null;
        visibleToClients: boolean;
        /** Le llega al cliente de verdad: él y su carpeta (con toda la cadena) son visibles. */
        visibleParaCliente: boolean;
        createdAt: Date;
        creator: {
            name: string;
            id: string;
        };
        versiones: {
            version: number;
            nota: string | null;
            createdAt: Date;
            uploadedBy: {
                id: string;
                name: string;
            };
            blobId: string;
            filename: string;
            contentType: string;
            bytes: number;
            enLinea: boolean;
        }[];
        /** Solo en enlaces (D-78): adónde lleva. En un archivo, null. */
        enlace: {
            url: string;
            sitio: string;
        } | null;
    };
    permisos: {
        nuevaVersion: boolean;
        cambiarEnlace: boolean;
        renombrar: boolean;
        papelera: boolean;
        cambiarVisibilidad: boolean;
        mover: boolean;
    };
}>;
/** Carpetas y archivos dentro de una carpeta (o de la raíz), con la ruta hasta ahí. */
export declare function listarArchivos(tx: Tx, actor: Actor, projectId: string, carpetaId: string | null): Promise<{
    ruta: {
        id: string;
        title: string | null;
    }[];
    carpeta: {
        id: string;
        visibleParaCliente: boolean;
        visibleToClients: boolean;
        cambiarVisibilidad: boolean;
    } | null;
    carpetas: {
        id: string;
        title: string | null;
        visibleToClients: boolean;
        elementos: number;
    }[];
    archivos: {
        id: string;
        title: string | null;
        visibleToClients: boolean;
        updatedAt: Date;
        versiones: number;
        comentarios: number;
        actual: {
            version: number;
            nota: string | null;
            createdAt: Date;
            uploadedBy: {
                id: string;
                name: string;
            };
            blobId: string;
            filename: string;
            contentType: string;
            bytes: number;
            enLinea: boolean;
        };
    }[];
    enlaces: {
        id: string;
        title: string | null;
        url: string;
        sitio: string;
        visibleToClients: boolean;
        updatedAt: Date;
        comentarios: number;
        creator: {
            name: string;
            id: string;
        };
    }[];
    permisos: {
        subir: boolean;
        crearCarpeta: boolean;
    };
    almacenamiento: {
        usados: null;
        maximo: null;
        maxArchivo: number;
    } | {
        usados: number;
        maximo: number | null;
        maxArchivo: number;
    };
}>;
export declare function detalleArchivo(tx: Tx, actor: Actor, id: string): Promise<{
    archivo: {
        id: string;
        title: string | null;
        carpetaId: string | null;
        visibleToClients: boolean;
        /** Le llega al cliente de verdad: él y su carpeta (con toda la cadena) son visibles. */
        visibleParaCliente: boolean;
        createdAt: Date;
        creator: {
            name: string;
            id: string;
        };
        versiones: {
            version: number;
            nota: string | null;
            createdAt: Date;
            uploadedBy: {
                id: string;
                name: string;
            };
            blobId: string;
            filename: string;
            contentType: string;
            bytes: number;
            enLinea: boolean;
        }[];
        /** Solo en enlaces (D-78): adónde lleva. En un archivo, null. */
        enlace: {
            url: string;
            sitio: string;
        } | null;
    };
    permisos: {
        nuevaVersion: boolean;
        cambiarEnlace: boolean;
        renombrar: boolean;
        papelera: boolean;
        cambiarVisibilidad: boolean;
        mover: boolean;
    };
}>;
/**
 * Un archivo físico para entregar: solo si es una versión de un archivo (o el adjunto de una
 * respuesta) que la persona puede ver (con toda su cadena: si la carpeta es interna, un cliente no lo baja ni con el enlace).
 */
export declare function blobParaLeer(tx: Tx, actor: Actor, blobId: string): Promise<{
    status: import("@prisma/client").$Enums.BlobStatus;
    storageKey: string;
    filename: string;
    contentType: string;
    byteSize: bigint;
}>;
