import type { Tx } from '../lib/contexto.js';
import type { Actor, ProyectoCargado } from './permisos.js';
export declare function actividadDelProyecto(tx: Tx, actor: Actor, proyecto: ProyectoCargado, opciones?: {
    antes?: Date;
    limite?: number;
}): Promise<{
    eventos: {
        id: string;
        action: string;
        createdAt: Date;
        actor: {
            name: string;
            id: string;
        };
        elemento: {
            id: string;
            type: import("@prisma/client").$Enums.RecordingType;
            title: string | null;
            activo: boolean;
            extracto: string | null;
            padre: {
                id: string;
                type: import("@prisma/client").$Enums.RecordingType;
                title: string | null;
            } | null;
        } | null;
        detalles: {
            personas: string[];
            title?: {} | undefined;
            name?: {} | undefined;
            from?: {} | null | undefined;
            to?: {} | null | undefined;
        };
    }[];
    siguiente: string | null;
}>;
