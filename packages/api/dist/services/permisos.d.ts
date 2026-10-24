/**
 * Quién puede hacer qué DENTRO de una cuenta. RLS ya cuida la frontera entre cuentas; aquí
 * se decide por rol, por membresía en el proyecto y por visibilidad para clientes.
 *
 * Regla de la casa: las rutas no deciden permisos sueltos. Cargan el contexto (proyecto,
 * elemento) con `services/proyectos.ts` y `services/elementos.ts` y preguntan a `puede()`.
 *
 * `puede()` es una función pura: recibe todo lo que necesita y no toca la base, así se
 * prueba sola y no hay consultas escondidas.
 */
import { type Rol } from '@lucuma-pm/shared';
import type { RecordingStatus, RecordingType } from '@prisma/client';
import type { Contexto } from '../lib/contexto.js';
/** Quién actúa (sale de `exigirCuenta`). Soporte en beta llega con rol admin. */
export interface Actor {
    ctx: Contexto;
    rol: Rol;
}
export interface ProyectoCargado {
    id: string;
    status: 'active' | 'archived' | 'trashed';
    createdById: string;
    /** La persona que actúa está en el proyecto (ProjectMember). */
    esMiembro: boolean;
}
export interface ElementoCargado {
    id: string;
    type: RecordingType;
    creatorId: string;
    status: RecordingStatus;
    /** Él y toda su cadena de padres son visibles para clientes. */
    visibleEnCadena: boolean;
    /** Algún padre está en la papelera (o archivado): el elemento no se ve ni se toca. */
    padreInactivo: boolean;
}
export type Accion = 'proyecto.ver' | 'proyecto.crear' | 'proyecto.editar' | 'proyecto.archivar' | 'proyecto.papelera' | 'proyecto.personas' | 'proyecto.verPapelera' | 'elemento.ver' | 'elemento.crear' | 'elemento.editar' | 'elemento.papelera' | 'elemento.cambiarVisibilidad' | 'elemento.mover' | 'tarea.completar' | 'tarea.asignar';
/** Tipos que edita cualquiera del equipo del proyecto, no solo quien los creó. */
export declare const DEL_EQUIPO: RecordingType[];
/** Qué tipos puede crear un cliente. Lo que crea nace visible para clientes. */
export declare const TIPOS_DE_CLIENTE: RecordingType[];
export declare function puede(actor: Actor, accion: Accion, sobre?: {
    proyecto?: ProyectoCargado;
    elemento?: ElementoCargado;
    tipo?: RecordingType;
    /** La persona que actúa es responsable de la tarea. */
    esAsignado?: boolean;
}): boolean;
/**
 * Corta si no puede. Cuando ni siquiera puede VER, responde 404 y no 403: así no revela que
 * el proyecto o el elemento existen.
 */
export declare function exigir(actor: Actor, accion: Accion, sobre?: Parameters<typeof puede>[2], mensaje?: string): void;
