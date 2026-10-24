import type { Tx } from '../lib/contexto.js';
/**
 * Quién puede ser mencionado en un elemento: personas activas de la cuenta que ven el
 * proyecto (dueño y admin siempre; el resto si está en el proyecto). Si el elemento no es
 * visible para clientes, los clientes quedan fuera: no se les avisa de algo que no pueden ver.
 */
export declare function mencionables(tx: Tx, accountId: string, projectId: string, opciones: {
    incluirClientes: boolean;
}): Promise<{
    userId: string;
    name: string;
    role: import("@prisma/client").$Enums.AccountRole;
}[]>;
/**
 * Reemplaza las menciones guardadas de un elemento por las del documento nuevo, quedándose
 * solo con las válidas. Devuelve los userIds que quedaron (los que recibirán aviso, día 11).
 * Las menciones salen del documento procesado en el servidor, nunca de una lista que mande
 * el navegador.
 */
export declare function guardarMenciones(tx: Tx, datos: {
    accountId: string;
    projectId: string;
    recordingId: string;
    ids: string[];
    visibleParaClientes: boolean;
}): Promise<string[]>;
