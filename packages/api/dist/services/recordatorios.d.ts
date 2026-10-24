/** "AAAA-MM-DD" de un instante en una zona horaria. */
export declare function diaEn(zona: string, instante?: Date): string;
export declare function sumarDias(dia: string, n: number): string;
/** Crea los recordatorios pendientes de una cuenta. Devuelve cuántos avisos nuevos hubo. */
export declare function recordatoriosDeCuenta(accountId: string, ahora?: Date): Promise<number>;
/** Todas las cuentas abiertas (latido externo). */
export declare function recordatoriosDeTodas(ahora?: Date): Promise<{
    cuentas: number;
    avisos: number;
}>;
export declare function dispararRecordatorios(accountId: string, log?: (e: unknown) => void): void;
export declare const olvidarDisparos: () => void;
