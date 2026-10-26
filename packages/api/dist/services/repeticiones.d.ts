import { type Tx } from '../lib/contexto.js';
import { type Actor } from './permisos.js';
export declare const MAX_DIA_REPETICION = 28;
/**
 * Programa (o reprograma) la repetición de una plantilla en un proyecto. Una plantilla se
 * repite una sola vez por proyecto: volver a pedirla cambia el día y el responsable.
 */
export declare function programarRepeticion(tx: Tx, actor: Actor, projectId: string, datos: {
    plantillaId: string;
    dia: number;
    responsableId: string | null;
    desde: string;
}): Promise<{
    id: string;
    dia: number;
    proxima: string;
}>;
export declare function repeticionesDelProyecto(tx: Tx, actor: Actor, projectId: string): Promise<{
    repeticiones: {
        id: string;
        plantilla: {
            name: string;
            id: string;
        };
        dia: number;
        proxima: string;
        ultima: string | null;
        error: string | null;
        responsable: string | null;
    }[];
}>;
export declare function quitarRepeticion(tx: Tx, actor: Actor, id: string): Promise<void>;
/** Agrega las plantillas que tocan hoy (o que quedaron atrasadas) en una cuenta. */
export declare function repeticionesDeCuenta(accountId: string, ahora?: Date): Promise<number>;
export declare function repeticionesDeTodas(ahora?: Date): Promise<{
    agregadas: number;
}>;
