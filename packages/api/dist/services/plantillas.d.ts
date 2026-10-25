import type { TemplateAudience } from '@prisma/client';
import type { Tx } from '../lib/contexto.js';
import { type Campo } from './campos.js';
import { type Actor } from './permisos.js';
export declare const MAX_TAREAS_PLANTILLA = 100;
export declare const MAX_DIA = 365;
export interface TareaPlantilla {
    title: string;
    notes?: string | null;
    audience: TemplateAudience;
    dayOffset?: number | null;
    /** Lo que pide la tarea (D-65): datos, archivos o enlaces. */
    campos?: unknown;
}
export interface DatosPlantilla {
    name: string;
    description?: string | null;
    items: TareaPlantilla[];
}
export declare function listarPlantillas(tx: Tx, actor: Actor): Promise<{
    plantillas: {
        id: string;
        name: string;
        description: string | null;
        updatedAt: Date;
        tareas: number;
        delCliente: number;
    }[];
    permisos: {
        gestionar: boolean;
    };
}>;
export declare function plantillaDetalle(tx: Tx, actor: Actor, id: string): Promise<{
    plantilla: {
        items: {
            campos: Campo[];
            id: string;
            title: string;
            notes: string | null;
            audience: import("@prisma/client").$Enums.TemplateAudience;
            dayOffset: number | null;
        }[];
        id: string;
        name: string;
        description: string | null;
        updatedAt: Date;
        tareas: number;
        delCliente: number;
    };
    permisos: {
        gestionar: boolean;
    };
}>;
/** Crea (id null) o reemplaza una plantilla entera: nombre, descripción y tareas en orden. */
export declare function guardarPlantilla(tx: Tx, actor: Actor, id: string | null, datos: DatosPlantilla): Promise<{
    plantilla: {
        items: {
            campos: Campo[];
            id: string;
            title: string;
            notes: string | null;
            audience: import("@prisma/client").$Enums.TemplateAudience;
            dayOffset: number | null;
        }[];
        id: string;
        name: string;
        description: string | null;
        updatedAt: Date;
        tareas: number;
        delCliente: number;
    };
    permisos: {
        gestionar: boolean;
    };
}>;
export declare function borrarPlantilla(tx: Tx, actor: Actor, id: string): Promise<void>;
/**
 * "Guardar como plantilla" desde una lista que salió bien. Las fechas pasan a "día N" contando
 * desde el día en que se creó la lista; las personas no se guardan, solo para quién es:
 * interna → equipo; visible y solo con clientes responsables → cliente; otra visible → cualquiera.
 */
export declare function plantillaDesdeLista(tx: Tx, actor: Actor, listaId: string, nombre?: string): Promise<{
    plantilla: {
        items: {
            campos: Campo[];
            id: string;
            title: string;
            notes: string | null;
            audience: import("@prisma/client").$Enums.TemplateAudience;
            dayOffset: number | null;
        }[];
        id: string;
        name: string;
        description: string | null;
        updatedAt: Date;
        tareas: number;
        delCliente: number;
    };
    permisos: {
        gestionar: boolean;
    };
}>;
export interface DatosAplicar {
    plantillaId: string;
    /** Día 1 de la plantilla. Por defecto, hoy en la zona de la cuenta. */
    inicio?: string;
    /** Nombre de la lista nueva. Por defecto, el de la plantilla. */
    titulo?: string;
    /**
     * Quién del equipo lleva las tareas del equipo. Por defecto, quien agrega la plantilla
     * (un bot no: sin responsable queda sin asignar). null = sin asignar.
     */
    responsableId?: string | null;
    /** Clientes del proyecto que reciben sus tareas. Por defecto, todos los del proyecto. */
    clienteIds?: string[];
}
/** Agrega una plantilla a un proyecto: una lista nueva con sus tareas, fechas y responsables. */
export declare function aplicarPlantilla(tx: Tx, actor: Actor, projectId: string, datos: DatosAplicar): Promise<{
    lista: {
        id: string;
        title: string | null;
    };
    tareas: number;
    inicio: string;
    sinCliente: boolean;
}>;
