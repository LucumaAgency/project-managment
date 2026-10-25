import type { Tx } from '../lib/contexto.js';
import { type Actor } from './permisos.js';
export declare const MAX_DIAS_DESPUES = 365;
/** Deja una tarea esperando a otra: sus responsables pasan a "previstos" y pierde la fecha. */
export declare function ponerEnEspera(tx: Tx, tareaId: string, esperaA: string, previstos: string[], diasDespues: number | null): Promise<void>;
/**
 * Activa una tarea que esperaba: asigna a los previstos (los que todavía pueden verla), pone la
 * fecha y avisa. `por` = la tarea cuyo final la activó (null = a mano).
 */
export declare function activar(tx: Tx, actor: Actor, tareaId: string, por: string | null): Promise<void>;
/** Al completar una tarea: se activan las que la esperaban (las activas y sin completar). */
export declare function activarLasQueEsperan(tx: Tx, actor: Actor, completadaId: string): Promise<void>;
/** Si se completa a mano una tarea que esperaba, deja de esperar (sin asignar a nadie). */
export declare function olvidarEspera(tx: Tx, tareaId: string): Promise<void>;
/**
 * Cambiar la espera desde la tarea (solo el equipo). Con `esperaA`, la tarea pasa a esperar
 * (sus responsables actuales quedan previstos). Con null, se activa ahora.
 */
export declare function fijarEspera(tx: Tx, actor: Actor, tareaId: string, esperaA: string | null, diasDespues?: number | null): Promise<void>;
/** Cambiar a quiénes se asignará cuando se active (mientras espera, "responsables" es esto). */
export declare function fijarPrevistos(tx: Tx, actor: Actor, projectId: string, tareaId: string, previstos: string[]): Promise<void>;
export interface InfoEspera {
    /** A qué espera; para un cliente, sin nombre si la otra tarea es interna. */
    espera: {
        id: string | null;
        title: string;
        borrada: boolean;
    };
    seAsignaraA: {
        userId: string;
        name: string;
    }[];
    diasDespues: number | null;
}
/** Lo que hay que mostrar de las tareas que esperan, de una vez para una lista de tareas. */
export declare function esperasDe(tx: Tx, actor: Actor, filas: {
    id: string;
    todo: {
        waitsForId?: string | null;
        pendingAssigneeIds?: unknown;
        dueAfterDays?: number | null;
    } | null;
}[]): Promise<Map<string, InfoEspera>>;
