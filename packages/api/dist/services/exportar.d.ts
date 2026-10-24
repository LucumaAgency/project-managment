import { type Contexto } from '../lib/contexto.js';
/** Nombre seguro para una carpeta o archivo dentro del ZIP. */
export declare function nombreZip(crudo: string, porDefecto?: string): string;
/** Evita dos entradas con el mismo nombre: "a.png", "a (2).png"… */
export declare function unicos(): (ruta: string) => string;
/**
 * Arma el ZIP. Devuelve el stream para mandarlo como respuesta; los archivos se agregan en
 * segundo plano y el ZIP se cierra al final. `log` recibe los archivos que faltaban en disco.
 */
export declare function exportarCuenta(ctx: Contexto, log?: (msg: string) => void): Promise<{
    stream: NodeJS.ReadableStream;
    nombre: string;
}>;
