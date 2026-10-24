export declare const DIAS_PAPELERA = 30;
export interface Purgado {
    proyectos: number;
    elementos: number;
    archivos: number;
    bytes: number;
}
export declare function purgarCuenta(accountId: string, ahora?: Date, log?: (e: unknown) => void): Promise<Purgado>;
/** Todas las cuentas (latido externo). Cada una con su RLS. */
export declare function purgarTodas(ahora?: Date, log?: (e: unknown) => void): Promise<Purgado>;
export declare function dispararPurga(accountId: string, log?: (e: unknown) => void): void;
export declare const olvidarPurgas: () => void;
