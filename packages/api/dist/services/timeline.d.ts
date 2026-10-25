import type { Tx } from '../lib/contexto.js';
import type { Actor } from './permisos.js';
export declare function timeline(tx: Tx, actor: Actor, filtros: {
    desde: string;
    hasta: string;
    proyecto?: string;
}): Promise<{
    desde: string;
    hasta: string;
    proyectos: {
        name: string;
        id: string;
    }[];
    tareas: {
        id: string;
        title: string | null;
        projectId: string;
        lista: string | null;
        desde: string | null;
        hasta: string | null;
        completada: boolean;
        hora: string | null;
        horaFin: string | null;
        lugar: string | null;
        columna: {
            nombre: string;
            tipo: import("./tablero.js").TipoColumna | null;
        } | null;
        visibleToClients: boolean;
        responsables: {
            userId: string;
            name: string;
        }[];
    }[];
    recortado: boolean;
}>;
