/**
 * Recordatorios de tareas (día 12, D-54): "vence mañana" y "venció ayer", en la bandeja de los
 * responsables (o de quien la creó, si no tiene). Cada recordatorio se crea UNA vez gracias a
 * `Notification.dedupeKey` (índice único): el latido externo y el disparo "al usar la app"
 * pueden correr a la vez sin duplicar nada.
 *
 * El día se calcula con la zona horaria de la cuenta (America/Lima por defecto).
 */
import { prismaAdmin } from '../db.js';
import { conCuenta } from '../lib/contexto.js';

/** "AAAA-MM-DD" de un instante en una zona horaria. */
export function diaEn(zona: string, instante = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);
  }
}
export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const aFecha = (dia: string) => new Date(`${dia}T00:00:00Z`);

/** Crea los recordatorios pendientes de una cuenta. Devuelve cuántos avisos nuevos hubo. */
export async function recordatoriosDeCuenta(accountId: string, ahora = new Date()): Promise<number> {
  // Sin persona fijada: es el sistema. RLS sigue limitando todo a esta cuenta.
  return conCuenta({ accountId, userId: '' }, async (tx) => {
    const cuenta = await tx.account.findUnique({ where: { id: accountId }, select: { timeZone: true, closedAt: true } });
    if (!cuenta || cuenta.closedAt) return 0;
    const hoy = diaEn(cuenta.timeZone, ahora);
    const manana = sumarDias(hoy, 1);
    const ayer = sumarDias(hoy, -1);

    const tareas = await tx.recording.findMany({
      where: {
        accountId,
        type: 'todo',
        status: 'active',
        project: { status: 'active' },
        parent: { status: 'active' },
        todo: { completedAt: null, dueOn: { in: [aFecha(manana), aFecha(ayer)] } },
      },
      select: {
        id: true,
        creatorId: true,
        visibleToClients: true,
        parent: { select: { visibleToClients: true } },
        todo: { select: { dueOn: true } },
        assignees: { select: { userId: true } },
      },
    });
    if (!tareas.length) return 0;

    const ids = new Set(tareas.flatMap((t) => [t.creatorId, ...t.assignees.map((a) => a.userId)]));
    const miembros = await tx.membership.findMany({
      where: { accountId, status: 'active', userId: { in: [...ids] } },
      select: { userId: true, role: true },
    });
    const rol = new Map(miembros.map((m) => [m.userId, m.role]));

    const filas = tareas.flatMap((t) => {
      const dia = t.todo!.dueOn!.toISOString().slice(0, 10);
      const tipo = dia === manana ? 'manana' : 'vencida';
      const visible = t.visibleToClients && (t.parent?.visibleToClients ?? false);
      const para = t.assignees.length ? t.assignees.map((a) => a.userId) : [t.creatorId];
      return para
        .filter((u) => rol.has(u) && (visible || rol.get(u) !== 'client'))
        .map((userId) => ({
          accountId,
          userId,
          recordingId: t.id,
          reason: 'due_soon' as const,
          dedupeKey: `vence:${t.id}:${userId}:${dia}:${tipo}`,
        }));
    });
    if (!filas.length) return 0;
    const r = await tx.notification.createMany({ data: filas, skipDuplicates: true });
    return r.count;
  });
}

/** Todas las cuentas abiertas (latido externo). */
export async function recordatoriosDeTodas(ahora = new Date()) {
  // Solo se leen los ids de las cuentas; cada una se procesa con su RLS (recordatoriosDeCuenta).
  const cuentas = await prismaAdmin.account.findMany({ where: { closedAt: null }, select: { id: true } });
  let avisos = 0;
  for (const c of cuentas) avisos += await recordatoriosDeCuenta(c.id, ahora);
  return { cuentas: cuentas.length, avisos };
}

/**
 * "Al usar la app": como mucho cada 30 minutos por cuenta y proceso, sin hacer esperar a nadie
 * (corre después de responder). Es la red de seguridad si el latido externo falla.
 */
const ultimo = new Map<string, number>();
const CADA_MS = 30 * 60_000;
export function dispararRecordatorios(accountId: string, log?: (e: unknown) => void) {
  const ahora = Date.now();
  if (ahora - (ultimo.get(accountId) ?? 0) < CADA_MS) return;
  ultimo.set(accountId, ahora);
  setImmediate(() =>
    import('./repeticiones.js')
      .then((m) => m.repeticionesDeCuenta(accountId))
      .then(() => recordatoriosDeCuenta(accountId))
      .catch((e) => log?.(e))
  );
}
export const olvidarDisparos = () => ultimo.clear();
