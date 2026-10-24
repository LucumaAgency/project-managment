import type { Tx } from '../lib/contexto.js';
import { type Actor, type ProyectoCargado } from './permisos.js';
export declare function listarMensajes(tx: Tx, actor: Actor, proyecto: ProyectoCargado): Promise<{
    mensajes: {
        id: string;
        title: string | null;
        extracto: string;
        visibleToClients: boolean;
        createdAt: Date;
        creator: {
            name: string;
            id: string;
        };
        comentarios: number;
        ultimaActividad: Date;
    }[];
    puedePublicar: boolean;
}>;
