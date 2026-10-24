export declare function tipoReal(cabecera: Buffer, nombre: string): string;
/** Solo lo reconocido por su firma se puede ver dentro de la app. */
export declare const seMuestraEnLinea: (tipo: string) => boolean;
/** Nombre de archivo limpio: sin rutas, sin caracteres de control, de largo razonable. */
export declare function nombreLimpio(crudo: string): string;
