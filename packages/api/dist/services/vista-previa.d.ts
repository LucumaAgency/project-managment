import type { Tx } from '../lib/contexto.js';
import type { Actor, ProyectoCargado } from './permisos.js';
export declare function vistaPrevia(tx: Tx, actor: Actor, proyecto: ProyectoCargado): Promise<{
    tareas: {
        pendientes: number;
        listas: {
            id: string;
            title: string | null;
            total: number;
            hechas: number;
            tareas: {
                id: string;
                title: string | null;
                dueOn: string | null;
            }[];
        }[];
    };
    mensajes: {
        id: string;
        title: string | null;
        autor: string;
        createdAt: Date;
        extracto: string;
    }[];
    archivos: {
        id: string;
        title: string | null;
        blobId: string;
        tipo: string;
    }[];
    ficha: {
        respondidos: number;
        total: number;
    };
}>;
