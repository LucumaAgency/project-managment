import type { FastifyRequest } from 'fastify';
import { type Tx } from '../lib/contexto.js';
import type { Actor } from './permisos.js';
export declare const huella: (clave: string) => string;
export interface AccesoBot {
    actor: Actor;
    keyId: string;
    slug: string;
    timeZone: string;
}
/** Crea una clave para un bot. Devuelve la clave en claro: se muestra UNA vez. */
export declare function crearClave(accountId: string, userId: string, nombre: string): Promise<string>;
/** `Authorization: Bearer lpm_…` → quién es y en qué cuenta. 401 con cualquier problema. */
export declare function exigirBot(req: FastifyRequest): Promise<AccesoBot>;
/** Un proyecto activo por id o por nombre (exacto, o que lo contenga). 404/409 con opciones. */
export declare function proyectoPorNombre(tx: Tx, a: AccesoBot, nombre: string): Promise<{
    name: string;
    id: string;
}>;
/** Gente del equipo por correo, id o nombre ("carlos"). Nunca clientes ni otros bots. */
export declare function personasPorNombre(tx: Tx, a: AccesoBot, nombres: string[]): Promise<{
    name: string;
    id: string;
    email: string;
}[]>;
export declare const enlaceTarea: (a: AccesoBot, projectId: string, id: string) => string;
export type Cuando = 'hoy' | 'manana' | 'semana' | 'vencidas' | 'todas';
/** Tareas pendientes (o recién completadas) con filtros de chat. */
export declare function tareasBot(a: AccesoBot, filtros: {
    responsable?: string;
    proyecto?: string;
    cuando: Cuando;
    completadas: boolean;
    limite: number;
}): Promise<{
    hoy: string;
    tareas: {
        id: string;
        titulo: string | null;
        proyecto: {
            id: string;
            nombre: string;
        };
        lista: string | null;
        vence: string | null;
        vencida: boolean;
        completada: Date | null;
        responsables: {
            nombre: string;
            correo: string;
        }[];
        enlace: string;
    }[];
}>;
/** Crea una tarea. La lista se elige por nombre; sin lista, la primera del proyecto (o "Pendientes"). */
export declare function crearTareaBot(a: AccesoBot, datos: {
    proyecto: string;
    lista?: string;
    titulo: string;
    vence?: string | null;
    responsables: string[];
    notas?: string;
}): Promise<{
    id: string;
    titulo: string;
    proyecto: {
        id: string;
        nombre: string;
    };
    lista: string | null;
    vence: string | null;
    responsables: {
        nombre: string;
        correo: string;
    }[];
    enlace: string;
}>;
export declare function completarTareaBot(a: AccesoBot, id: string, completar: boolean): Promise<{
    id: string;
    titulo: string | null;
    completada: Date | null;
    enlace: string;
}>;
/**
 * Crea un proyecto. Con el mismo nombre (sin tildes ni mayúsculas) que uno activo, devuelve
 * ese y `existia: true`: el bot puede repetir el pedido sin duplicar. Respeta el límite del plan.
 */
export declare function crearProyectoBot(a: AccesoBot, datos: {
    nombre: string;
    descripcion?: string;
}): Promise<{
    proyecto: {
        id: string;
        nombre: string;
    };
    existia: boolean;
}>;
/** Plantillas de lista (D-64) con cuántas tareas tienen. */
export declare function plantillasBot(a: AccesoBot): Promise<{
    plantillas: {
        id: string;
        nombre: string;
        descripcion: string | null;
        tareas: number;
        delCliente: number;
    }[];
}>;
/**
 * Agrega una plantilla a un proyecto, ambos por nombre ("onboarding" en "flecha taxi").
 * Las tareas del equipo van al responsable (si no se dice, quedan sin asignar: el bot no las
 * lleva); las del cliente, a los clientes del proyecto.
 */
export declare function aplicarPlantillaBot(a: AccesoBot, datos: {
    proyecto: string;
    plantilla: string;
    inicio?: string;
    responsable?: string;
    lista?: string;
}): Promise<{
    proyecto: {
        id: string;
        nombre: string;
    };
    plantilla: string;
    lista: string | null;
    listaId: string;
    tareas: number;
    inicio: string;
    responsable: {
        nombre: string;
        correo: string;
    } | null;
    sinCliente: boolean;
    enlace: string;
}>;
