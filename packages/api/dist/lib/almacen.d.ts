import { type Readable } from 'node:stream';
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
export declare function almacenEnDisco(raiz: string): Almacen;
/** El almacén en uso (en disco, en la carpeta de la configuración). */
export declare const almacen: () => Almacen;
