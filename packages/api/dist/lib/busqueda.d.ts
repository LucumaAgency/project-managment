/**
 * Piezas puras de la búsqueda (D-57): normalizar como la base, armar la consulta y recortar
 * el fragmento con lo encontrado marcado.
 */
/** Igual que pm_sin_tildes() de la base: minúsculas y sin tildes, una letra por una letra. */
export declare function sinTildes(t: string): string;
/** Palabras de la búsqueda, normalizadas; solo letras y números (nada llega crudo a to_tsquery). */
export declare function terminos(q: string): string[];
/** "dise pla" → "dise:* & pla:*" (cada palabra como prefijo: encuentra mientras se escribe). */
export declare const consultaTs: (ts: string[]) => string;
export type Marcas = [number, number][];
/** Dónde aparece cada término como inicio de palabra (posiciones sobre el texto original). */
export declare function marcar(texto: string, ts: string[]): Marcas;
/** Un pedazo del texto alrededor de la primera coincidencia, con sus marcas ajustadas. */
export declare function fragmento(texto: string, ts: string[], largo?: number): {
    texto: string;
    marcas: Marcas;
} | null;
