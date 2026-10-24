export interface DocumentoProcesado {
    /** El JSON normalizado (sin atributos desconocidos): es lo que se guarda en `body`. */
    json: Nodo;
    html: string;
    /** Para búsqueda, vistas previas y avisos. Bloques separados por salto de línea. */
    texto: string;
    /** userIds mencionados, sin repetir, en orden de aparición. */
    menciones: string[];
}
export interface Nodo {
    type: string;
    attrs?: Record<string, unknown>;
    content?: Nodo[];
    text?: string;
    marks?: {
        type: string;
        attrs?: Record<string, unknown>;
    }[];
}
export declare function escaparHtml(s: string): string;
/** Solo http(s) y mailto. Cualquier otra cosa (javascript:, data:, vbscript:) no es enlace. */
export declare function enlaceSeguro(href: unknown): string | null;
export declare function procesarDocumento(entrada: unknown): DocumentoProcesado;
/** Texto plano (lo que mandaba la API antes del editor) → documento de párrafos. */
export declare function documentoDesdeTexto(texto: string): Nodo;
/** ¿El documento está vacío (solo párrafos sin texto ni menciones)? */
export declare const documentoVacio: (d: DocumentoProcesado) => boolean;
