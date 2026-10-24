import { Prisma, type RecordingType } from '@prisma/client';
import type { Tx } from '../lib/contexto.js';
import { type Accion, type Actor, type ElementoCargado, type ProyectoCargado } from './permisos.js';
/** Dentro de qué puede ir cada tipo. `null` = en la raíz del proyecto. */
export declare const PADRES: Record<RecordingType, (RecordingType | null)[]>;
/** Los archivos se crean al confirmar una subida (día 10), no por la ruta genérica. */
export declare const TIPOS_CREABLES: readonly ["todolist", "todo", "message", "folder", "comment"];
export type TipoCreable = (typeof TIPOS_CREABLES)[number];
/** Columnas que se devuelven a la web. */
export declare const SELECCION: {
    readonly id: true;
    readonly projectId: true;
    readonly type: true;
    readonly parentId: true;
    readonly title: true;
    readonly bodyText: true;
    readonly bodyHtml: true;
    readonly body: true;
    readonly visibleToClients: true;
    readonly status: true;
    readonly position: true;
    readonly createdAt: true;
    readonly updatedAt: true;
    readonly trashedAt: true;
    readonly creator: {
        readonly select: {
            readonly id: true;
            readonly name: true;
        };
    };
};
/**
 * Carga un elemento con su proyecto y corta si la acción no se permite. Lo que no existe y lo
 * que no puedes ver (p. ej. algo interno, si eres cliente) responden igual: 404.
 */
export declare function elementoPara(tx: Tx, actor: Actor, id: string, accion: Accion, mensaje?: string): Promise<{
    proyecto: ProyectoCargado & {
        name: string;
        id: string;
        createdAt: Date;
        status: import("@prisma/client").$Enums.ProjectStatus;
        description: string | null;
        createdById: string;
        archivedAt: Date | null;
        trashedAt: Date | null;
    };
    elemento: ElementoCargado;
}>;
export interface DatosNuevo {
    type: TipoCreable;
    parentId?: string | null;
    title?: string;
    /** Documento del editor (JSON de Tiptap). El servidor arma el HTML y el texto. */
    body?: unknown;
    /** Alternativa: texto plano (se convierte a párrafos). Si viene `body`, manda `body`. */
    bodyText?: string;
    visibleToClients?: boolean;
}
export declare function crearElemento(tx: Tx, actor: Actor, projectId: string, datos: DatosNuevo): Promise<{
    mencionados: string[];
    id: string;
    createdAt: Date;
    status: import("@prisma/client").$Enums.RecordingStatus;
    projectId: string;
    updatedAt: Date;
    trashedAt: Date | null;
    type: import("@prisma/client").$Enums.RecordingType;
    parentId: string | null;
    title: string | null;
    body: Prisma.JsonValue;
    bodyHtml: string | null;
    bodyText: string | null;
    visibleToClients: boolean;
    position: number;
    creator: {
        name: string;
        id: string;
    };
}>;
export interface DatosEdicion {
    title?: string;
    body?: unknown;
    bodyText?: string | null;
    visibleToClients?: boolean;
    position?: number;
}
export declare function editarElemento(tx: Tx, actor: Actor, id: string, datos: DatosEdicion): Promise<{
    mencionados: string[];
    id: string;
    createdAt: Date;
    status: import("@prisma/client").$Enums.RecordingStatus;
    projectId: string;
    updatedAt: Date;
    trashedAt: Date | null;
    type: import("@prisma/client").$Enums.RecordingType;
    parentId: string | null;
    title: string | null;
    body: Prisma.JsonValue;
    bodyHtml: string | null;
    bodyText: string | null;
    visibleToClients: boolean;
    position: number;
    creator: {
        name: string;
        id: string;
    };
}>;
/** A la papelera: deja de verse con todo lo que tiene dentro. Se purga a los 30 días (día 14). */
export declare function papeleraElemento(tx: Tx, actor: Actor, id: string): Promise<{
    id: string;
    createdAt: Date;
    status: import("@prisma/client").$Enums.RecordingStatus;
    projectId: string;
    updatedAt: Date;
    trashedAt: Date | null;
    type: import("@prisma/client").$Enums.RecordingType;
    parentId: string | null;
    title: string | null;
    body: Prisma.JsonValue;
    bodyHtml: string | null;
    bodyText: string | null;
    visibleToClients: boolean;
    position: number;
    creator: {
        name: string;
        id: string;
    };
}>;
export declare function restaurarElemento(tx: Tx, actor: Actor, id: string): Promise<{
    id: string;
    createdAt: Date;
    status: import("@prisma/client").$Enums.RecordingStatus;
    projectId: string;
    updatedAt: Date;
    trashedAt: Date | null;
    type: import("@prisma/client").$Enums.RecordingType;
    parentId: string | null;
    title: string | null;
    body: Prisma.JsonValue;
    bodyHtml: string | null;
    bodyText: string | null;
    visibleToClients: boolean;
    position: number;
    creator: {
        name: string;
        id: string;
    };
}>;
/**
 * Hijos activos de un padre (o de la raíz del proyecto), en orden. Para un cliente, solo los
 * visibles, y solo si el padre (con su cadena) también lo es.
 */
export declare function listarElementos(tx: Tx, actor: Actor, proyecto: ProyectoCargado, filtro: {
    parentId: string | null;
    type?: RecordingType;
}): Promise<{
    id: string;
    createdAt: Date;
    status: import("@prisma/client").$Enums.RecordingStatus;
    projectId: string;
    updatedAt: Date;
    trashedAt: Date | null;
    type: import("@prisma/client").$Enums.RecordingType;
    parentId: string | null;
    title: string | null;
    body: Prisma.JsonValue;
    bodyHtml: string | null;
    bodyText: string | null;
    visibleToClients: boolean;
    position: number;
    creator: {
        name: string;
        id: string;
    };
}[]>;
/**
 * Mueve un elemento: lo pone justo después de `despuesDe` (null = primero) dentro de
 * `parentId` (el actual si no se indica). Sirve para ordenar tareas y listas y para pasar una
 * tarea a otra lista. La posición nueva es el promedio entre sus vecinos (sin renumerar); si
 * la diferencia se vuelve demasiado chica, se renumera ese grupo.
 */
export declare function moverElemento(tx: Tx, actor: Actor, id: string, destino: {
    parentId?: string | null;
    despuesDe: string | null;
}): Promise<{
    id: string;
    createdAt: Date;
    status: import("@prisma/client").$Enums.RecordingStatus;
    projectId: string;
    updatedAt: Date;
    trashedAt: Date | null;
    type: import("@prisma/client").$Enums.RecordingType;
    parentId: string | null;
    title: string | null;
    body: Prisma.JsonValue;
    bodyHtml: string | null;
    bodyText: string | null;
    visibleToClients: boolean;
    position: number;
    creator: {
        name: string;
        id: string;
    };
}>;
/**
 * De una lista de elementos, cuáles ve HOY un cliente: él y toda su cadena de padres visibles
 * y activos. Una sola consulta recursiva para todos (feed de actividad, bandeja, búsqueda).
 * Pasa por RLS como todo lo demás.
 */
export declare function visiblesParaCliente(tx: Tx, ids: string[]): Promise<Set<string>>;
