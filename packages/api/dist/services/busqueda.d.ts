import { type Marcas } from '../lib/busqueda.js';
import type { Tx } from '../lib/contexto.js';
import type { Actor } from './permisos.js';
export interface Resultado {
    id: string;
    type: 'todolist' | 'todo' | 'message' | 'folder' | 'upload' | 'comment';
    titulo: {
        texto: string;
        marcas: Marcas;
    };
    fragmento: {
        texto: string;
        marcas: Marcas;
    } | null;
    proyecto: {
        id: string;
        name: string;
        archivado: boolean;
    };
    /** Lo que se abre al hacer clic: el mismo elemento, o lo comentado si es un comentario. */
    abre: {
        id: string;
        type: string;
    };
    completada?: boolean;
    autor: {
        id: string;
        name: string;
    };
    updatedAt: Date;
}
export declare function buscar(tx: Tx, actor: Actor, q: string, opciones?: {
    proyectoId?: string;
    limite?: number;
}): Promise<{
    terminos: string[];
    proyectos: {
        id: string;
        name: string;
        archivado: boolean;
        marcas: Marcas;
    }[];
    resultados: Resultado[];
}>;
