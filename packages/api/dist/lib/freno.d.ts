/**
 * Freno a la fuerza bruta: N intentos por clave en una ventana de tiempo.
 *
 * En memoria a propósito (como el CRM): basta para cortar un diccionario y no exige tabla
 * ni Redis. Con varios procesos cada uno cuenta por su lado; el límite real sube un poco
 * pero sigue siendo órdenes de magnitud menos que sin freno.
 */
export declare class Freno {
    private maximo;
    private ventanaMs;
    private intentos;
    constructor(maximo: number, ventanaMs: number);
    bloqueado(clave: string): boolean;
    anotar(clave: string): void;
    limpiar(clave: string): void;
}
