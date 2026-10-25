import type { Tx } from '../lib/contexto.js';
import { type Actor, type ProyectoCargado } from './permisos.js';
type FilaTarea = {
    id: string;
    parentId: string | null;
    title: string | null;
    bodyHtml: string | null;
    body: unknown;
    visibleToClients: boolean;
    position: number;
    createdAt: Date;
    creator: {
        id: string;
        name: string;
    };
    todo: {
        dueOn: Date | null;
        completedAt: Date | null;
        completedBy: {
            id: string;
            name: string;
        } | null;
        fields: unknown;
        waitsForId: string | null;
        pendingAssigneeIds: unknown;
        dueAfterDays: number | null;
    } | null;
    assignees: {
        user: {
            id: string;
            name: string;
        };
    }[];
};
/** Fecha sin hora (@db.Date) ↔ "AAAA-MM-DD". */
export declare const aDia: (d: Date | null | undefined) => string | null;
declare function aTarea(f: FilaTarea, conCuerpo?: boolean): {
    visibleToClients: boolean;
    position: number;
    createdAt: Date;
    creator: {
        id: string;
        name: string;
    };
    dueOn: string | null;
    completedAt: Date | null;
    completedBy: {
        id: string;
        name: string;
    } | null;
    assignees: {
        userId: string;
        name: string;
    }[];
    /** Cuántas cosas pide (D-65); 0 = tarea normal. */
    pide: number;
    body?: unknown;
    id: string;
    listaId: string | null;
    title: string | null;
    bodyHtml: string | null;
    tieneNotas: boolean;
};
export type Tarea = ReturnType<typeof aTarea>;
/** Listas del proyecto con sus tareas, en orden. Un cliente ve solo lo visible. */
export declare function listarTareas(tx: Tx, actor: Actor, proyecto: ProyectoCargado): Promise<{
    listas: {
        id: string;
        title: string | null;
        bodyHtml: string | null;
        body: import("@prisma/client/runtime/library").JsonValue;
        visibleToClients: boolean;
        position: number;
        permisos: {
            editar: boolean;
            papelera: boolean;
            agregar: boolean;
            mover: boolean;
            visibilidad: boolean;
        };
        tareas: {
            comentarios: number;
            respondidos: number;
            espera: import("./espera.js").InfoEspera | null;
            visibleToClients: boolean;
            position: number;
            createdAt: Date;
            creator: {
                id: string;
                name: string;
            };
            dueOn: string | null;
            completedAt: Date | null;
            completedBy: {
                id: string;
                name: string;
            } | null;
            assignees: {
                userId: string;
                name: string;
            }[];
            /** Cuántas cosas pide (D-65); 0 = tarea normal. */
            pide: number;
            body?: unknown;
            id: string;
            listaId: string | null;
            title: string | null;
            bodyHtml: string | null;
            tieneNotas: boolean;
        }[];
    }[];
    permisos: {
        crearLista: boolean;
        completarCualquiera: boolean;
        asignar: boolean;
    };
}>;
/** Detalle de una tarea con el documento de las notas (para editarlo) y lo que puedo hacer. */
export declare function tareaDetalle(tx: Tx, actor: Actor, id: string): Promise<{
    tarea: {
        vistasAccesos?: {
            campoId: string | null;
            nombre: string;
            el: Date;
        }[] | undefined;
        visibleParaCliente: boolean;
        campos: {
            respuesta: import("./campos.js").RespuestaVista | null;
            id: string;
            etiqueta: string;
            tipo: import("./campos.js").TipoCampo;
            obligatorio: boolean;
            ayuda?: string;
        }[];
        espera: import("./espera.js").InfoEspera | null;
        visibleToClients: boolean;
        position: number;
        createdAt: Date;
        creator: {
            id: string;
            name: string;
        };
        dueOn: string | null;
        completedAt: Date | null;
        completedBy: {
            id: string;
            name: string;
        } | null;
        assignees: {
            userId: string;
            name: string;
        }[];
        /** Cuántas cosas pide (D-65); 0 = tarea normal. */
        pide: number;
        body?: unknown;
        id: string;
        listaId: string | null;
        title: string | null;
        bodyHtml: string | null;
        tieneNotas: boolean;
    };
    permisos: {
        editar: boolean;
        completar: boolean;
        asignar: boolean;
        papelera: boolean;
        cambiarVisibilidad: boolean;
        mover: boolean;
        responder: boolean;
        pedir: boolean;
    };
}>;
export interface DatosTarea {
    title?: string;
    body?: unknown;
    visibleToClients?: boolean;
    dueOn?: string | null;
    assigneeIds?: string[];
    /** Lo que pide la tarea (D-65); null o [] = nada. Solo el equipo. */
    campos?: unknown;
    /** Se activa cuando se complete esta otra tarea (D-67); null = ya no espera (se activa). */
    esperaA?: string | null;
    /** Mientras espera: vence N días después de activarse (1 = el mismo día). */
    diasDespues?: number | null;
}
export declare function crearTarea(tx: Tx, actor: Actor, listaId: string, datos: DatosTarea): Promise<{
    vistasAccesos?: {
        campoId: string | null;
        nombre: string;
        el: Date;
    }[] | undefined;
    visibleParaCliente: boolean;
    campos: {
        respuesta: import("./campos.js").RespuestaVista | null;
        id: string;
        etiqueta: string;
        tipo: import("./campos.js").TipoCampo;
        obligatorio: boolean;
        ayuda?: string;
    }[];
    espera: import("./espera.js").InfoEspera | null;
    visibleToClients: boolean;
    position: number;
    createdAt: Date;
    creator: {
        id: string;
        name: string;
    };
    dueOn: string | null;
    completedAt: Date | null;
    completedBy: {
        id: string;
        name: string;
    } | null;
    assignees: {
        userId: string;
        name: string;
    }[];
    /** Cuántas cosas pide (D-65); 0 = tarea normal. */
    pide: number;
    body?: unknown;
    id: string;
    listaId: string | null;
    title: string | null;
    bodyHtml: string | null;
    tieneNotas: boolean;
}>;
export declare function editarTarea(tx: Tx, actor: Actor, id: string, datos: DatosTarea): Promise<{
    vistasAccesos?: {
        campoId: string | null;
        nombre: string;
        el: Date;
    }[] | undefined;
    visibleParaCliente: boolean;
    campos: {
        respuesta: import("./campos.js").RespuestaVista | null;
        id: string;
        etiqueta: string;
        tipo: import("./campos.js").TipoCampo;
        obligatorio: boolean;
        ayuda?: string;
    }[];
    espera: import("./espera.js").InfoEspera | null;
    visibleToClients: boolean;
    position: number;
    createdAt: Date;
    creator: {
        id: string;
        name: string;
    };
    dueOn: string | null;
    completedAt: Date | null;
    completedBy: {
        id: string;
        name: string;
    } | null;
    assignees: {
        userId: string;
        name: string;
    }[];
    /** Cuántas cosas pide (D-65); 0 = tarea normal. */
    pide: number;
    body?: unknown;
    id: string;
    listaId: string | null;
    title: string | null;
    bodyHtml: string | null;
    tieneNotas: boolean;
}>;
export declare function completarTarea(tx: Tx, actor: Actor, id: string, completar: boolean): Promise<{
    vistasAccesos?: {
        campoId: string | null;
        nombre: string;
        el: Date;
    }[] | undefined;
    visibleParaCliente: boolean;
    campos: {
        respuesta: import("./campos.js").RespuestaVista | null;
        id: string;
        etiqueta: string;
        tipo: import("./campos.js").TipoCampo;
        obligatorio: boolean;
        ayuda?: string;
    }[];
    espera: import("./espera.js").InfoEspera | null;
    visibleToClients: boolean;
    position: number;
    createdAt: Date;
    creator: {
        id: string;
        name: string;
    };
    dueOn: string | null;
    completedAt: Date | null;
    completedBy: {
        id: string;
        name: string;
    } | null;
    assignees: {
        userId: string;
        name: string;
    }[];
    /** Cuántas cosas pide (D-65); 0 = tarea normal. */
    pide: number;
    body?: unknown;
    id: string;
    listaId: string | null;
    title: string | null;
    bodyHtml: string | null;
    tieneNotas: boolean;
}>;
/** Para campos.ts: completar cuando ya está todo lo que pide. */
export declare const completarPorRespuestas: (tx: Tx, actor: Actor, id: string) => Promise<{
    vistasAccesos?: {
        campoId: string | null;
        nombre: string;
        el: Date;
    }[] | undefined;
    visibleParaCliente: boolean;
    campos: {
        respuesta: import("./campos.js").RespuestaVista | null;
        id: string;
        etiqueta: string;
        tipo: import("./campos.js").TipoCampo;
        obligatorio: boolean;
        ayuda?: string;
    }[];
    espera: import("./espera.js").InfoEspera | null;
    visibleToClients: boolean;
    position: number;
    createdAt: Date;
    creator: {
        id: string;
        name: string;
    };
    dueOn: string | null;
    completedAt: Date | null;
    completedBy: {
        id: string;
        name: string;
    } | null;
    assignees: {
        userId: string;
        name: string;
    }[];
    /** Cuántas cosas pide (D-65); 0 = tarea normal. */
    pide: number;
    body?: unknown;
    id: string;
    listaId: string | null;
    title: string | null;
    bodyHtml: string | null;
    tieneNotas: boolean;
}>;
/** Activar ahora una tarea que espera (el equipo, por ejemplo si la anterior se borró). */
export declare function activarAhora(tx: Tx, actor: Actor, id: string): Promise<{
    vistasAccesos?: {
        campoId: string | null;
        nombre: string;
        el: Date;
    }[] | undefined;
    visibleParaCliente: boolean;
    campos: {
        respuesta: import("./campos.js").RespuestaVista | null;
        id: string;
        etiqueta: string;
        tipo: import("./campos.js").TipoCampo;
        obligatorio: boolean;
        ayuda?: string;
    }[];
    espera: import("./espera.js").InfoEspera | null;
    visibleToClients: boolean;
    position: number;
    createdAt: Date;
    creator: {
        id: string;
        name: string;
    };
    dueOn: string | null;
    completedAt: Date | null;
    completedBy: {
        id: string;
        name: string;
    } | null;
    assignees: {
        userId: string;
        name: string;
    }[];
    /** Cuántas cosas pide (D-65); 0 = tarea normal. */
    pide: number;
    body?: unknown;
    id: string;
    listaId: string | null;
    title: string | null;
    bodyHtml: string | null;
    tieneNotas: boolean;
}>;
export {};
