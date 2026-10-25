import type { Prisma } from '@prisma/client';
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
            porOtra?: boolean | undefined;
            title?: {} | undefined;
            name?: {} | undefined;
            from?: {} | null | undefined;
            to?: {} | null | undefined;
        };
    }[];
    siguiente: string | null;
}>;
export declare const SELECCION_EVENTO: {
    readonly id: true;
    readonly action: true;
    readonly createdAt: true;
    readonly details: true;
    readonly recordingId: true;
    readonly actor: {
        readonly select: {
            readonly id: true;
            readonly name: true;
        };
    };
    readonly recording: {
        readonly select: {
            readonly id: true;
            readonly type: true;
            readonly title: true;
            readonly status: true;
            readonly bodyText: true;
            readonly parent: {
                readonly select: {
                    readonly id: true;
                    readonly type: true;
                    readonly title: true;
                };
            };
        };
    };
};
type FilaEvento = Prisma.EventGetPayload<{
    select: typeof SELECCION_EVENTO;
}>;
/** Un evento tal como lo muestra la web (frase, enlace): actividad y bandeja. */
export declare function presentarEventos(tx: Tx, filas: FilaEvento[]): Promise<{
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
        porOtra?: boolean | undefined;
        title?: {} | undefined;
        name?: {} | undefined;
        from?: {} | null | undefined;
        to?: {} | null | undefined;
    };
}[]>;
export {};
