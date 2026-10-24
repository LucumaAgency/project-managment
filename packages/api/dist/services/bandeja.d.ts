import type { Tx } from '../lib/contexto.js';
import type { Actor } from './permisos.js';
export declare function listarBandeja(tx: Tx, actor: Actor, opciones?: {
    soloNoLeidos?: boolean;
    antes?: Date;
    limite?: number;
}): Promise<{
    avisos: {
        id: string;
        reason: import("@prisma/client").$Enums.NotificationReason;
        leido: boolean;
        createdAt: Date;
        abre: string | null;
        proyecto: {
            id: string;
            name: string;
        };
        evento: {
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
        };
    }[];
    siguiente: string | null;
}>;
export declare function contarNoLeidos(tx: Tx, actor: Actor): Promise<number>;
/** Marca como leídos: uno, todos, o los de un elemento (al abrirlo). */
export declare function marcarLeidos(tx: Tx, actor: Actor, cuales: {
    id?: string;
    recordingId?: string;
    todos?: boolean;
}): Promise<{
    marcados: number;
    noLeidos: number;
}>;
