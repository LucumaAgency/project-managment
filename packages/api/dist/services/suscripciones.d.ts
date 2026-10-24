import type { Tx } from '../lib/contexto.js';
/**
 * Quién sigue un elemento (y recibirá aviso de sus comentarios y cambios, día 11).
 *
 * Se sigue solo, sin hacer nada: quien crea algo, quien comenta (sigue lo comentado), a quien
 * mencionan y a quien asignan una tarea. Además se puede seguir y dejar de seguir a mano.
 * Dejar de seguir no se deshace solo: volver a comentar o ser mencionado sí vuelve a sumar.
 */
export declare function suscribir(tx: Tx, datos: {
    accountId: string;
    recordingId: string;
    userIds: string[];
}): Promise<void>;
export declare function desuscribir(tx: Tx, datos: {
    recordingId: string;
    userId: string;
}): Promise<void>;
export declare function suscriptores(tx: Tx, recordingId: string): Promise<{
    userId: string;
    name: string;
}[]>;
