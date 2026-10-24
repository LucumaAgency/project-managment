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
export interface Destinatario {
    userId: string;
    reason: NotificationReason;
}
export declare function avisar(tx: Tx, datos: {
    accountId: string;
    eventId: string;
    /** Lo que se abre al tocar el aviso. */
    recordingId: string;
    actorId: string;
    visibleToClients: boolean;
    destinatarios: Destinatario[];
}): Promise<string[]>;
/** Quienes siguen algo, como destinatarios con el motivo "lo sigues". */
export declare function seguidoresComo(tx: Tx, recordingId: string): Promise<Destinatario[]>;
