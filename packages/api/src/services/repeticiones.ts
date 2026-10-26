/**
 * Plantillas que se repiten cada mes (D-73): el reporte mensual de cada cliente. Al agregar una
 * plantilla se puede pedir "repetir cada mes el día N"; el latido (routes/cron.ts) la vuelve a
 * agregar ese día, a nombre de quien la programó, con las fechas, la carpeta y el nombre del mes.
 *
 * Como la app no avisa a quien hace la acción, y aquí "quien la hace" es quien la programó, al
 * responsable se le deja un aviso directo: así le llega "ya toca el reporte" aunque sea él mismo.
 */
import { esCliente } from '@lucuma-pm/shared';
import { prismaAdmin } from '../db.js';
import { conCuenta, type Tx } from '../lib/contexto.js';
import { HttpError } from '../lib/errores.js';
import { siguienteDiaDelMes } from '../lib/marcadores.js';
import { exigir, type Actor } from './permisos.js';
import { aplicarPlantilla } from './plantillas.js';
import { proyectoPara } from './proyectos.js';
import { diaEn } from './recordatorios.js';

export const MAX_DIA_REPETICION = 28;
const dia = (d: Date) => d.toISOString().slice(0, 10);

async function exigirAgregar(tx: Tx, actor: Actor, projectId: string) {
  if (esCliente(actor.rol)) throw new HttpError(404, 'No encontrado.');
  const proyecto = await proyectoPara(tx, actor, projectId, 'proyecto.ver');
  exigir(actor, 'elemento.crear', { proyecto, tipo: 'todolist' }, 'No puedes agregar listas en este proyecto.');
  return proyecto;
}

/**
 * Programa (o reprograma) la repetición de una plantilla en un proyecto. Una plantilla se
 * repite una sola vez por proyecto: volver a pedirla cambia el día y el responsable.
 */
export async function programarRepeticion(
  tx: Tx,
  actor: Actor,
  projectId: string,
  datos: { plantillaId: string; dia: number; responsableId: string | null; desde: string }
) {
  await exigirAgregar(tx, actor, projectId);
  if (!Number.isInteger(datos.dia) || datos.dia < 1 || datos.dia > MAX_DIA_REPETICION) {
    throw new HttpError(400, `El día de la repetición va de 1 a ${MAX_DIA_REPETICION} (así existe en todos los meses).`);
  }
  const proxima = siguienteDiaDelMes(datos.desde, datos.dia);
  const accountId = actor.ctx.accountId;
  const ya = await tx.templateRecurrence.findFirst({ where: { accountId, projectId, templateId: datos.plantillaId, active: true }, select: { id: true } });
  const data = {
    dayOfMonth: datos.dia,
    responsableId: datos.responsableId,
    nextRunOn: new Date(`${proxima}T00:00:00Z`),
    lastError: null,
  };
  const r = ya
    ? await tx.templateRecurrence.update({ where: { id: ya.id }, data, select: { id: true } })
    : await tx.templateRecurrence.create({
        data: { ...data, accountId, projectId, templateId: datos.plantillaId, createdById: actor.ctx.userId },
        select: { id: true },
      });
  return { id: r.id, dia: datos.dia, proxima };
}

export async function repeticionesDelProyecto(tx: Tx, actor: Actor, projectId: string) {
  if (esCliente(actor.rol)) return { repeticiones: [] };
  await proyectoPara(tx, actor, projectId, 'proyecto.ver');
  const filas = await tx.templateRecurrence.findMany({
    where: { accountId: actor.ctx.accountId, projectId, active: true },
    select: { id: true, dayOfMonth: true, nextRunOn: true, lastRunOn: true, lastError: true, responsableId: true, createdById: true, template: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const ids = [...new Set(filas.flatMap((f) => [f.responsableId ?? f.createdById]))];
  const nombres = new Map((await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return {
    repeticiones: filas.map((f) => ({
      id: f.id,
      plantilla: f.template,
      dia: f.dayOfMonth,
      proxima: dia(f.nextRunOn),
      ultima: f.lastRunOn ? dia(f.lastRunOn) : null,
      error: f.lastError,
      responsable: nombres.get(f.responsableId ?? f.createdById) ?? null,
    })),
  };
}

export async function quitarRepeticion(tx: Tx, actor: Actor, id: string) {
  const r = await tx.templateRecurrence.findFirst({ where: { id, accountId: actor.ctx.accountId, active: true }, select: { projectId: true } });
  if (!r) throw new HttpError(404, 'No encontrado.');
  await exigirAgregar(tx, actor, r.projectId);
  await tx.templateRecurrence.update({ where: { id }, data: { active: false } });
}

/** Agrega las plantillas que tocan hoy (o que quedaron atrasadas) en una cuenta. */
export async function repeticionesDeCuenta(accountId: string, ahora = new Date()): Promise<number> {
  const pendientes = await conCuenta({ accountId, userId: '' }, async (tx) => {
    const cuenta = await tx.account.findUnique({ where: { id: accountId }, select: { timeZone: true, closedAt: true } });
    if (!cuenta || cuenta.closedAt) return { hoy: '', filas: [] };
    const hoy = diaEn(cuenta.timeZone, ahora);
    const filas = await tx.templateRecurrence.findMany({
      where: { accountId, active: true, nextRunOn: { lte: new Date(`${hoy}T00:00:00Z`) } },
      select: { id: true, projectId: true, templateId: true, dayOfMonth: true, responsableId: true, createdById: true, nextRunOn: true },
    });
    return { hoy, filas };
  });

  let hechas = 0;
  for (const r of pendientes.filas) {
    const inicio = dia(r.nextRunOn);
    // Si se atrasó varios meses (servidor caído), se agrega una vez y sigue desde hoy.
    const siguiente = new Date(`${siguienteDiaDelMes(pendientes.hoy, r.dayOfMonth)}T00:00:00Z`);
    try {
      const ok = await conCuenta({ accountId, userId: r.createdById }, async (tx) => {
        // Tomar la fila: si otro proceso ya la corrió, nextRunOn cambió y no se repite.
        const tomada = await tx.templateRecurrence.updateMany({ where: { id: r.id, active: true, nextRunOn: r.nextRunOn }, data: { nextRunOn: siguiente } });
        if (!tomada.count) return false;
        const m = await tx.membership.findFirst({ where: { accountId, userId: r.createdById, status: 'active' }, select: { role: true, user: { select: { isBot: true } } } });
        if (!m || esCliente(m.role)) {
          await tx.templateRecurrence.update({ where: { id: r.id }, data: { active: false, lastError: 'Quien la programó ya no está en el equipo.' } });
          return false;
        }
        const actor: Actor = { ctx: { accountId, userId: r.createdById }, rol: m.role };
        const res = await aplicarPlantilla(tx, actor, r.projectId, {
          plantillaId: r.templateId,
          inicio,
          ...(r.responsableId ? { responsableId: r.responsableId } : {}),
        });
        const destinatario = r.responsableId ?? (m.user.isBot ? null : r.createdById);
        const evento = await tx.event.findFirst({ where: { recordingId: res.lista.id, action: 'created' }, select: { id: true } });
        if (destinatario && evento) {
          await tx.notification.createMany({
            data: [{ accountId, userId: destinatario, eventId: evento.id, recordingId: res.lista.id, reason: 'assigned', dedupeKey: `repite:${r.id}:${inicio}` }],
            skipDuplicates: true,
          });
        }
        await tx.templateRecurrence.update({ where: { id: r.id }, data: { lastRunOn: r.nextRunOn, lastError: null } });
        return true;
      });
      if (ok) hechas++;
    } catch (e) {
      // No reintentar cada hora algo que va a fallar igual: se anota y pasa al mes siguiente.
      const motivo = e instanceof Error ? e.message.slice(0, 300) : 'Error desconocido';
      await conCuenta({ accountId, userId: '' }, (tx) =>
        tx.templateRecurrence.updateMany({ where: { id: r.id, nextRunOn: r.nextRunOn }, data: { nextRunOn: siguiente, lastError: `${inicio}: ${motivo}` } })
      );
    }
  }
  return hechas;
}

export async function repeticionesDeTodas(ahora = new Date()) {
  const cuentas = await prismaAdmin.account.findMany({ where: { closedAt: null }, select: { id: true } });
  let agregadas = 0;
  for (const c of cuentas) agregadas += await repeticionesDeCuenta(c.id, ahora);
  return { agregadas };
}
