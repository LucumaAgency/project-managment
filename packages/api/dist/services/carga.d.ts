/**
 * Carga inicial de proyectos desde un archivo JSON (día 15, D-61): para empezar a usar la app
 * con los proyectos reales sin crearlos uno por uno. Usa los mismos servicios que la web
 * (permisos, eventos, avisos), así que lo cargado es igual a lo creado a mano.
 *
 * Se puede correr más de una vez: un proyecto que ya existe con ese nombre (activo o
 * archivado) se salta entero. El archivo con datos de clientes NO va al repo (es público):
 * se sube a privados/ con el Administrador de archivos de Plesk.
 */
import { z } from 'zod';
import type { Rol } from '@lucuma-pm/shared';
export declare const esquemaCarga: z.ZodObject<{
    cuenta: z.ZodString;
    /** Quién figura como creador: dueño o administrador de la cuenta. */
    como: z.ZodString;
    proyectos: z.ZodArray<z.ZodObject<{
        nombre: z.ZodString;
        descripcion: z.ZodOptional<z.ZodString>;
        /** Correos de gente de la cuenta (equipo) que entra al proyecto. */
        personas: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        listas: z.ZodDefault<z.ZodArray<z.ZodObject<{
            titulo: z.ZodString;
            tareas: z.ZodDefault<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
                titulo: z.ZodString;
                vence: z.ZodOptional<z.ZodString>;
                responsables: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                notas: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                titulo: string;
                responsables: string[];
                vence?: string | undefined;
                notas?: string | undefined;
            }, {
                titulo: string;
                vence?: string | undefined;
                responsables?: string[] | undefined;
                notas?: string | undefined;
            }>]>, "many">>;
        }, "strip", z.ZodTypeAny, {
            tareas: (string | {
                titulo: string;
                responsables: string[];
                vence?: string | undefined;
                notas?: string | undefined;
            })[];
            titulo: string;
        }, {
            titulo: string;
            tareas?: (string | {
                titulo: string;
                vence?: string | undefined;
                responsables?: string[] | undefined;
                notas?: string | undefined;
            })[] | undefined;
        }>, "many">>;
        mensajes: z.ZodDefault<z.ZodArray<z.ZodObject<{
            titulo: z.ZodString;
            texto: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            texto: string;
            titulo: string;
        }, {
            titulo: string;
            texto?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        nombre: string;
        personas: string[];
        listas: {
            tareas: (string | {
                titulo: string;
                responsables: string[];
                vence?: string | undefined;
                notas?: string | undefined;
            })[];
            titulo: string;
        }[];
        mensajes: {
            texto: string;
            titulo: string;
        }[];
        descripcion?: string | undefined;
    }, {
        nombre: string;
        personas?: string[] | undefined;
        descripcion?: string | undefined;
        listas?: {
            titulo: string;
            tareas?: (string | {
                titulo: string;
                vence?: string | undefined;
                responsables?: string[] | undefined;
                notas?: string | undefined;
            })[] | undefined;
        }[] | undefined;
        mensajes?: {
            titulo: string;
            texto?: string | undefined;
        }[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    cuenta: string;
    proyectos: {
        nombre: string;
        personas: string[];
        listas: {
            tareas: (string | {
                titulo: string;
                responsables: string[];
                vence?: string | undefined;
                notas?: string | undefined;
            })[];
            titulo: string;
        }[];
        mensajes: {
            texto: string;
            titulo: string;
        }[];
        descripcion?: string | undefined;
    }[];
    como: string;
}, {
    cuenta: string;
    proyectos: {
        nombre: string;
        personas?: string[] | undefined;
        descripcion?: string | undefined;
        listas?: {
            titulo: string;
            tareas?: (string | {
                titulo: string;
                vence?: string | undefined;
                responsables?: string[] | undefined;
                notas?: string | undefined;
            })[] | undefined;
        }[] | undefined;
        mensajes?: {
            titulo: string;
            texto?: string | undefined;
        }[] | undefined;
    }[];
    como: string;
}>;
export type Carga = z.infer<typeof esquemaCarga>;
export interface Informe {
    creados: string[];
    saltados: string[];
    listas: number;
    tareas: number;
    mensajes: number;
}
/** Valida y prepara: cuenta, quién carga, y que cada correo sea de alguien del equipo. */
export declare function prepararCarga(datos: unknown): Promise<{
    carga: {
        cuenta: string;
        proyectos: {
            nombre: string;
            personas: string[];
            listas: {
                tareas: (string | {
                    titulo: string;
                    responsables: string[];
                    vence?: string | undefined;
                    notas?: string | undefined;
                })[];
                titulo: string;
            }[];
            mensajes: {
                texto: string;
                titulo: string;
            }[];
            descripcion?: string | undefined;
        }[];
        como: string;
    };
    cuenta: {
        name: string;
        id: string;
    };
    porCorreo: Map<string, {
        id: string;
        rol: Rol;
    }>;
    actor: {
        ctx: {
            accountId: string;
            userId: string;
        };
        rol: "owner" | "admin";
    };
}>;
/** Carga (o, con `probar`, solo dice qué haría). */
export declare function cargar(datos: unknown, opciones?: {
    probar?: boolean;
}): Promise<Informe>;
