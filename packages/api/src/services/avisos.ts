/**
 * Avisos: la bandeja de cada persona (Notification). Se crean en la MISMA transacción que el
 * cambio que los provoca (D-53): sin cola ni cron, que en Plesk no son confiables. Son unas
 * pocas filas por cambio.
 *
 * Reglas:
 *  - Nunca se avisa a quien hizo el cambio.
 *  - Un aviso por persona y por evento; si hay varios motivos, gana el más fuerte
 *    (mención > asignación > lo que sigues).
 *  - Solo a personas activas en la cuenta. A un cliente, solo si el evento es visible para
 *    clientes (y al leer la bandeja se vuelve a revisar con la visibilidad de hoy).
 *  - `recordingId` del aviso es lo que hay que abrir: en un comentario, lo comentado.
 */
import type { NotificationReason } from '@prisma/client';
import type { Tx } from '../lib/contexto.js';

const FUERZA: Record<NotificationReason, number> = { mentioned: 3, assigned: 2, subscribed: 1, due_soon: 0 };

export interface Destinatario {
  userId: string;
  reason: NotificationReason;
}

export async function avisar(
  tx: Tx,
  datos: {
    accountId: string;
    eventId: string;
    /** Lo que se abre al tocar el aviso. */
    recordingId: string;
    actorId: string;
    visibleToClients: boolean;
    destinatarios: Destinatario[];
  }
) {
  const elegido = new Map<string, NotificationReason>();
  for (const d of datos.destinatarios) {
    if (d.userId === datos.actorId) continue;
    const previo = elegido.get(d.userId);
    if (!previo || FUERZA[d.reason] > FUERZA[previo]) elegido.set(d.userId, d.reason);
  }
  if (!elegido.size) return [];

  const activos = await tx.membership.findMany({
    where: { accountId: datos.accountId, status: 'active', userId: { in: [...elegido.keys()] } },
    select: { userId: true, role: true },
  });
  const quienes = activos.filter((m) => datos.visibleToClients || m.role !== 'client').map((m) => m.userId);
  if (!quienes.length) return [];
  await tx.notification.createMany({
    data: quienes.map((userId) => ({
      accountId: datos.accountId,
      userId,
      eventId: datos.eventId,
      recordingId: datos.recordingId,
      reason: elegido.get(userId)!,
    })),
  });
  return quienes;
}

/** Quienes siguen algo, como destinatarios con el motivo "lo sigues". */
export async function seguidoresComo(tx: Tx, recordingId: string): Promise<Destinatario[]> {
  const filas = await tx.subscription.findMany({ where: { recordingId }, select: { userId: true } });
  return filas.map((f) => ({ userId: f.userId, reason: 'subscribed' as const }));
}
