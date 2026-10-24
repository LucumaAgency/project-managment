/**
 * Entre las encontradas, la más cercana a la base: la menor versión que sea >= `minimo`. Una
 * más nueva de la cuenta también sirve para respaldar, pero su pg_restore escribe ajustes que
 * una base vieja no conoce (pg 17 → `transaction_timeout` en una 16; visto en el CI). Si
 * ninguna alcanza, la más nueva (quien llama dice que no sirve).
 */
export declare function elegir<T extends {
    version: number;
}>(encontradas: T[], minimo: number): T | null;
/** pg_dump / pg_restore para una base de versión `minimo` (ver `elegir`). */
export declare function buscarHerramienta(nombre: 'pg_dump' | 'pg_restore', minimo?: number): Promise<{
    ruta: string;
    version: number;
} | null>;
/**
 * La URL de Prisma lista para libpq: sin la clave (va en PGPASSWORD, así no se ve en la lista
 * de procesos del servidor compartido) y sin parámetros que libpq no conoce (?schema=…).
 */
export declare function conexionPg(url: string): {
    dbname: string;
    password: string;
};
export declare function versionServidor(): Promise<number>;
export interface Respaldo {
    archivo: string;
    bytes: number;
    archivos: number;
    ms: number;
}
/** Hace el respaldo de hoy (o de `dia`). Lanza un error con el motivo si no se puede. */
/** `nombre` cambia el nombre del archivo (p. ej. la copia previa a restaurar); esa no se rota. */
export declare function hacerRespaldo(opciones?: {
    dia?: string;
    dir?: string;
    mantener?: number;
    nombre?: string;
}): Promise<Respaldo>;
/** Deja los `mantener` respaldos más nuevos (y sus listas de archivos). */
export declare function rotar(dir: string, mantener: number): Promise<void>;
/** Respaldos que hay, del más nuevo al más viejo. */
export declare function listarRespaldos(dir?: string): Promise<{
    dia: string;
    archivo: string;
    bytes: number;
}[]>;
export declare function respaldoDelDia(log?: (e: unknown) => void): Promise<string>;
export declare const olvidarRespaldo: () => void;
/** Para los tests: esperar el respaldo en segundo plano. */
export declare const esperarRespaldo: () => Promise<unknown>;
/**
 * Restaura un respaldo sobre la base actual (BORRA lo que hay). Antes hace una copia de lo
 * actual (antes-de-restaurar-<fecha>.dump), por si hubo que arrepentirse.
 */
export declare function restaurarRespaldo(archivo: string): Promise<{
    copiaPrevia: string;
}>;
/** pg_restore de `archivo` en la base de `url` (los tests restauran en una base aparte). */
export declare function restaurarEn(archivo: string, url: string): Promise<void>;
