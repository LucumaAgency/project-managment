/**
 * Tareas que piden algo (D-65, etapa 2 de 12-PLANTILLAS-Y-FLUJOS.md): una tarea puede pedir
 * datos (texto o párrafo), archivos o enlaces. Quien la tiene asignada (o el equipo) responde
 * ahí mismo; cuando están todos los campos obligatorios, la tarea se completa sola. Lo
 * respondido en un proyecto arma su ficha del cliente.
 *
 * Los campos viven en TodoDetail.fields (y en la plantilla, ListTemplateItem.fields); cada
 * respuesta es una fila de TaskAnswer. Los archivos son blobs colgados de la tarea
 * (RecordingAttachment): se ven con los mismos permisos que la tarea y, si se quitan, la purga
 * los borra del disco al día siguiente.
 */
import type { Readable } from 'node:stream';
import { Prisma } from '@prisma/client';
import { type Tx } from '../lib/contexto.js';
import { type Actor, type ElementoCargado, type ProyectoCargado } from './permisos.js';
export declare const TIPOS_CAMPO: readonly ["texto", "parrafo", "archivo", "enlaces", "acceso"];
export type TipoCampo = (typeof TIPOS_CAMPO)[number];
export interface Campo {
    id: string;
    etiqueta: string;
    tipo: TipoCampo;
    obligatorio: boolean;
    ayuda?: string;
}
export declare const MAX_CAMPOS = 20;
/** Lo guardado en la base → campos (lo que no tenga forma de campo se ignora). */
export declare function leerCampos(json: unknown): Campo[];
/**
 * Valida los campos que llegan del navegador. Los que ya existían conservan su id (así no se
 * pierden sus respuestas); los nuevos reciben el siguiente (c1, c2…). Lista vacía = null.
 */
export declare function normalizarCampos(entrada: unknown, existentes?: Campo[]): Campo[] | null;
export declare const columnaCampos: (campos: Campo[] | null) => Prisma.NullTypes.DbNull | Prisma.InputJsonValue;
/** Acceso protegido (D-66): el proveedor queda a la vista; lo demás, cifrado. */
export interface AccesoGuardado {
    proveedor: string | null;
    cifrado: string;
}
export interface DatosAcceso {
    url?: string;
    usuario?: string;
    clave?: string;
    notas?: string;
}
/**
 * Lo que se puede mostrar de una respuesta. Un acceso NUNCA sale con su texto cifrado: solo el
 * proveedor y que está protegido (para verlo está verAcceso, que deja registro).
 */
export declare function valorPublico(v: unknown): unknown;
/** ¿Están todos los obligatorios? */
export declare function completa(campos: Campo[], respondidos: Set<string>): boolean;
/** Respuestas de varias tareas, con los datos de cada archivo y de quién respondió. */
export declare function respuestasDe(tx: Tx, tareaIds: string[]): Promise<Map<string, Map<string, RespuestaVista>>>;
export interface RespuestaVista {
    valor: unknown;
    respondidoEl: Date;
    respondidoPor: {
        id: string;
        name: string;
    };
}
/** Campos de una tarea con su respuesta, en orden. */
export declare function camposConRespuestas(campos: Campo[], respuestas: Map<string, RespuestaVista> | undefined): {
    respuesta: RespuestaVista | null;
    id: string;
    etiqueta: string;
    tipo: TipoCampo;
    obligatorio: boolean;
    ayuda?: string;
}[];
export declare function puedeResponder(tx: Tx, actor: Actor, proyecto: ProyectoCargado, elemento: ElementoCargado): Promise<boolean>;
/**
 * Guarda respuestas (solo los campos que vienen; vacío = borrar esa respuesta). Si con esto
 * quedan todos los obligatorios, completa la tarea. `completar` lo hace tareas.ts para no
 * depender en círculo.
 */
export declare function responder(tx: Tx, actor: Actor, tareaId: string, respuestas: Record<string, unknown>, completar: (tx: Tx, actor: Actor, id: string) => Promise<unknown>): Promise<{
    cambiaron: string[];
    seCompleto: boolean;
}>;
/**
 * Cambia lo que pide una tarea (solo el equipo). Las respuestas de los campos que se quitan (o
 * cambian de tipo) se borran con sus archivos.
 */
export declare function fijarCampos(tx: Tx, actor: Actor, tareaId: string, entrada: unknown): Promise<void>;
/**
 * Sube un archivo a un campo de tipo archivo y lo suma a su respuesta. Tres pasos como en
 * archivos.ts: permiso, bytes fuera de la base, registro.
 */
export declare function subirArchivoCampo(actor: Actor, tareaId: string, campoId: string, nombre: string, entrada: Readable, completar: (tx: Tx, actor: Actor, id: string) => Promise<unknown>): Promise<{
    cambiaron: string[];
    seCompleto: boolean;
    blobId: string;
    nombre: string;
}>;
/**
 * Ficha del cliente: todo lo respondido en el proyecto, agrupado por tarea, en el orden de
 * las listas. Cada quien ve solo las tareas que puede ver (el cliente, las visibles).
 */
export declare function fichaProyecto(tx: Tx, actor: Actor, projectId: string): Promise<{
    proyecto: {
        id: string;
        name: string;
    };
    tareas: {
        id: string;
        title: string | null;
        lista: string | null;
        completada: boolean;
        respondidos: number;
        campos: {
            respuesta: RespuestaVista | null;
            id: string;
            etiqueta: string;
            tipo: TipoCampo;
            obligatorio: boolean;
            ayuda?: string;
        }[];
    }[];
}>;
/**
 * Ver un acceso protegido (D-66): solo el equipo, y cada vez queda en el registro de seguridad
 * con quién, cuándo y cuál. El cliente que lo cargó no lo vuelve a ver.
 */
export declare function verAcceso(tx: Tx, actor: Actor, tareaId: string, campoId: string, ip?: string): Promise<{
    acceso: {
        url?: string;
        usuario?: string;
        clave?: string;
        notas?: string;
        proveedor: string | null;
    };
    vistas: {
        campoId: string | null;
        nombre: string;
        el: Date;
    }[];
}>;
/** Quién vio los accesos de una tarea (lo más nuevo primero), para el equipo. */
export declare function vistasDeAccesos(tx: Tx, tareaId: string): Promise<{
    campoId: string | null;
    nombre: string;
    el: Date;
}[]>;
