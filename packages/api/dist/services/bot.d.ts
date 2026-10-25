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
