import type { Tx } from '../lib/contexto.js';
import { type Accion, type Actor, type ProyectoCargado } from './permisos.js';
/**
 * Carga un proyecto de la cuenta con lo que `puede()` necesita y corta si la acción no se
 * permite. Un proyecto que no existe y uno que no puedes ver responden igual (404).
 */
export declare function proyectoPara(tx: Tx, actor: Actor, projectId: string, accion: Accion, mensaje?: string): Promise<ProyectoCargado & {
    status: import("@prisma/client").$Enums.ProjectStatus;
    name: string;
    id: string;
    createdAt: Date;
    trashedAt: Date | null;
    description: string | null;
    createdById: string;
    archivedAt: Date | null;
}>;
/** Corta con el motivo del plan si sumar un proyecto activo pasa el límite. */
export declare function exigirCupoProyectos(tx: Tx, accountId: string): Promise<void>;
