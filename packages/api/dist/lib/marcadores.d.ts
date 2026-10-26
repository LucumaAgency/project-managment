export declare const MARCADORES: readonly ["{mes}", "{mes-1}", "{aaaa-mm}", "{aaaa-mm-1}"];
/** `dia` = AAAA-MM-DD. */
export declare function expandirMarcadores(texto: string, dia: string): string;
/** El primer día con número `diaDelMes` que cae DESPUÉS de `desde` (AAAA-MM-DD). */
export declare function siguienteDiaDelMes(desde: string, diaDelMes: number): string;
