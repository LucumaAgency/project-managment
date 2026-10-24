/**
 * Comentarios: un elemento `comment` colgado de lo que se comenta (lista, tarea, mensaje,
 * archivo). Copia la visibilidad de su padre (services/elementos.ts). Crear, editar y borrar
 * son las operaciones genéricas; aquí, listar con lo que cada uno puede hacer y seguir.
 */
import type { Tx } from '../lib/contexto.js';
import { type Actor } from './permisos.js';
export declare function listarComentarios(tx: Tx, actor: Actor, elementoId: string): Promise<{
    comentarios: {
        id: string;
        bodyHtml: string | null;
        body: import("@prisma/client/runtime/library").JsonValue | undefined;
        creator: {
            name: string;
            id: string;
        };
        createdAt: Date;
        editado: boolean;
        permisos: {
            editar: boolean;
            papelera: boolean;
        };
    }[];
    puedeComentar: boolean;
    siguiendo: boolean;
    seguidores: {
        userId: string;
        name: string;
    }[];
}>;
export declare function comentar(tx: Tx, actor: Actor, elementoId: string, body: unknown): Promise<{
    mencionados: string[];
    status: import("@prisma/client").$Enums.RecordingStatus;
    body: import("@prisma/client/runtime/library").JsonValue;
    id: string;
    createdAt: Date;
    projectId: string;
    type: import("@prisma/client").$Enums.RecordingType;
    parentId: string | null;
    title: string | null;
    bodyHtml: string | null;
    bodyText: string | null;
    visibleToClients: boolean;
    position: number;
    trashedAt: Date | null;
    updatedAt: Date;
    creator: {
        name: string;
        id: string;
    };
}>;
export declare function seguir(tx: Tx, actor: Actor, elementoId: string, si: boolean): Promise<{
    siguiendo: boolean;
    seguidores: {
        userId: string;
        name: string;
    }[];
}>;
