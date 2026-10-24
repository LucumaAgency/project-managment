import type { Prisma } from '@prisma/client';
import type { Tx } from '../lib/contexto.js';
/**
 * Actividad del proyecto (feed e historial). Se escribe con el MISMO `tx` que el cambio: si
 * el cambio se deshace, el evento también; nunca queda un "creó X" de algo que no existe.
 * Las notificaciones salen de aquí en un job (día 11).
 */
export type AccionEvento = 'created' | 'updated' | 'trashed' | 'restored' | 'archived' | 'unarchived' | 'visibility_changed' | 'member_added' | 'member_removed';
export declare function registrarEvento(tx: Tx, datos: {
    accountId: string;
    projectId: string;
    recordingId?: string | null;
    actorId: string;
    action: AccionEvento;
    details?: Prisma.InputJsonValue;
    /** Copia de la visibilidad efectiva al momento: el feed del cliente filtra por aquí. */
    visibleToClients?: boolean;
}): Promise<void>;
