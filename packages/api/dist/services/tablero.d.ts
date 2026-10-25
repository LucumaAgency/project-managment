import type { Tx } from '../lib/contexto.js';
import { type Actor } from './permisos.js';
export type TipoColumna = 'revision' | 'hecho';
export interface Columna {
    id: string;
    nombre: string;
    tipo?: TipoColumna;
}
export declare const COLUMNAS_INICIALES: Columna[];
export declare function leerColumnas(json: unknown): Columna[];
/**
 * Valida las columnas que llegan. La última es siempre "Hecho" (se agrega si falta); a lo más
 * una de revisión. Las que ya existían conservan su id (así sus tarjetas no se mueven).
 */
export declare function normalizarColumnas(entrada: unknown, existentes: Columna[]): Columna[];
/** En qué columna se muestra una tarea: la suya si existe; si no, Hecho o la primera. */
export declare function columnaDe(columnas: Columna[], columnId: string | null | undefined, completada: boolean): Columna;
/** Tableros de varias listas, para el listado de tareas. */
export declare function tablerosDe(tx: Tx, listaIds: string[]): Promise<Map<string, {
    enabled: boolean;
    columnas: Columna[];
}>>;
/** Al completar o reabrir (por donde sea): la tarjeta va a Hecho, o sale de ahí. */
export declare function columnaSegunEstado(tx: Tx, tareaId: string, completada: boolean): Promise<void>;
/** Ver la lista como tablero (o volver a lista). Las columnas se guardan aunque se apague. */
export declare function verComoTablero(tx: Tx, actor: Actor, listaId: string, enabled: boolean): Promise<{
    enabled: boolean;
    columnas: Columna[];
} | null>;
/** Editar las columnas (nombre, orden, cuál es de revisión). Las tarjetas de una columna que se quita pasan a la primera. */
export declare function fijarColumnas(tx: Tx, actor: Actor, listaId: string, entrada: unknown): Promise<{
    enabled: boolean;
    columnas: Columna[];
}>;
/** Mover una tarjeta a otra columna (el equipo). A Hecho la completa; desde Hecho, la reabre. */
export declare function moverAColumna(tx: Tx, actor: Actor, tareaId: string, columnaId: string): Promise<void>;
/** Aprobar en revisión: quien ve la tarjeta (el cliente, sobre todo). Pasa a Hecho. */
export declare function aprobar(tx: Tx, actor: Actor, tareaId: string): Promise<void>;
/**
 * Pedir cambios en revisión: deja el comentario y la tarjeta vuelve a la columna anterior a la
 * de revisión (o a la primera).
 */
export declare function pedirCambios(tx: Tx, actor: Actor, tareaId: string, comentario: string): Promise<void>;
export interface Paso {
    id: string;
    texto: string;
    hecho: boolean;
    porId?: string;
    el?: string;
}
export declare function leerPasos(json: unknown): Paso[];
/**
 * Guardar los pasos. Cambiar cuáles son (agregar, quitar, renombrar, ordenar) es del equipo;
 * marcarlos lo hace quien puede completar la tarea.
 */
export declare function fijarPasos(tx: Tx, actor: Actor, tareaId: string, entrada: {
    id?: string;
    texto: string;
    hecho?: boolean;
}[]): Promise<void>;
