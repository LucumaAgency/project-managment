/** La clave del .env como 32 bytes, o null si falta o no sirve. */
export declare function claveDesde(texto: string): Buffer | null;
/** Una clave nueva para poner en ACCESOS_CLAVE. */
export declare const claveNueva: () => string;
export declare const hayClaveAccesos: () => boolean;
export declare function cifrar(datos: object): string;
export declare function descifrar<T>(texto: string): T;
