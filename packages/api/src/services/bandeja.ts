/**
 * La bandeja de la persona en la cuenta activa. Ojo: RLS separa cuentas, no personas; por
 * eso TODA consulta aquí filtra por `userId` (lo prueba un test: nadie ve la bandeja ajena).
 */
import { esCliente } from '@lucuma-pm/shared';
import type { Prisma } from '@prisma/client';
import type { Tx } from '../lib/contexto.js';
import { presentarEventos, SELECCION_EVENTO } from './actividad.js';
import { visiblesParaCliente } from './elementos.js';
import type { Actor } from './permisos.js';

const POR_PAGINA = 30;

export async function listarBandeja(tx: Tx, actor: Actor, opciones: { soloNoLeidos?: boolean; antes?: Date; limite?: number } = {}) {
  const limite = Math.min(opciones.limite ?? POR_PAGINA, 100);
  const where: Prisma.NotificationWhereInput = {
    accountId: actor.ctx.accountId,
    userId: actor.ctx.userId,
    ...(opciones.soloNoLeidos ? { readAt: null } : {}),
    ...(opciones.antes ? { createdAt: { lt: opciones.antes } } : {}),
  };
  const filas = await tx.notification.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limite + 1,
    select: {
      id: true,
      reason: true,
      readAt: true,
      createdAt: true,
      recordingId: true,
      recording: { select: { status: true } },
      event: { select: { ...SELECCION_EVENTO, project: { select: { id: true, name: true, status: true } } } },
    },
  });
  const hayMas = filas.length > limite;
  let pagina = filas.slice(0, limite).filter((f) => f.event);

  // Con la visibilidad de HOY: si algo pasó a interno o se borró, el aviso ya no se muestra
  // a un cliente. Al equipo se le muestra sin enlace.
  if (esCliente(actor.rol)) {
    const ok = await visiblesParaCliente(tx, pagina.map((f) => f.recordingId!).filter(Boolean));
    pagina = pagina.filter((f) => f.recordingId && ok.has(f.recordingId));
  }
  const eventos = await presentarEventos(tx, pagina.map((f) => f.event!));
  return {
    avisos: pagina.map((f, i) => ({
      id: f.id,
      reason: f.reason,
      leido: !!f.readAt,
      createdAt: f.createdAt,
      abre: f.recordingId && f.recording?.status === 'active' ? f.recordingId : null,
      proyecto: { id: f.event!.project.id, name: f.event!.project.name },
      evento: eventos[i],
    })),
    siguiente: hayMas && pagina.length ? filas[limite - 1].createdAt.toISOString() : null,
  };
}

export async function contarNoLeidos(tx: Tx, actor: Actor) {
  return tx.notification.count({ where: { accountId: actor.ctx.accountId, userId: actor.ctx.userId, readAt: null } });
}

/** Marca como leídos: uno, todos, o los de un elemento (al abrirlo). */
export async function marcarLeidos(tx: Tx, actor: Actor, cuales: { id?: string; recordingId?: string; todos?: boolean }) {
  const r = await tx.notification.updateMany({
    where: {
      accountId: actor.ctx.accountId,
      userId: actor.ctx.userId,
      readAt: null,
      ...(cuales.id ? { id: cuales.id } : {}),
      ...(cuales.recordingId ? { recordingId: cuales.recordingId } : {}),
    },
    data: { readAt: new Date() },
  });
  return { marcados: r.count, noLeidos: await contarNoLeidos(tx, actor) };
}
