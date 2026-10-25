import type { Prisma } from '@prisma/client';
import type { Tx } from '../lib/contexto.js';

/**
 * Actividad del proyecto (feed e historial). Se escribe con el MISMO `tx` que el cambio: si
 * el cambio se deshace, el evento también; nunca queda un "creó X" de algo que no existe.
 * Las notificaciones salen de aquí en un job (día 11).
 */
export type AccionEvento =
  | 'created'
  | 'updated'
  | 'trashed'
  | 'restored'
  | 'archived'
  | 'unarchived'
  | 'visibility_changed'
  | 'member_added'
  | 'member_removed'
  | 'moved'
  | 'completed'
  | 'reopened'
  | 'answered' // respondió lo que pide una tarea (D-65)
  | 'assigned'
  | 'unassigned'
  | 'due_changed'
  | 'version_uploaded';

export async function registrarEvento(
  tx: Tx,
  datos: {
    accountId: string;
    projectId: string;
    recordingId?: string | null;
    actorId: string;
    action: AccionEvento;
    details?: Prisma.InputJsonValue;
    /** Copia de la visibilidad efectiva al momento: el feed del cliente filtra por aquí. */
    visibleToClients?: boolean;
  }
) {
  const e = await tx.event.create({
    data: {
      accountId: datos.accountId,
      projectId: datos.projectId,
      recordingId: datos.recordingId ?? null,
      actorId: datos.actorId,
      action: datos.action,
      details: datos.details,
      visibleToClients: datos.visibleToClients ?? false,
    },
    select: { id: true },
  });
  return e.id;
}
