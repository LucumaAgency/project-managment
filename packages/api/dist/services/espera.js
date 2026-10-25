/**
 * "Se activa cuando" (D-67, etapa 4 de 12-PLANTILLAS-Y-FLUJOS.md): una tarea puede esperar a
 * que se complete otra del proyecto. Mientras espera no tiene responsables ni fecha (nadie
 * recibe avisos ni recordatorios de algo que todavía no puede hacer). Al completarse la
 * anterior se activa sola: se asigna a quienes estaban previstos, les llega el aviso y la fecha
 * se cuenta desde ese día, así que si un paso se atrasa, los siguientes se corren solos.
 *
 * La activación la dispara quien completa la anterior (a veces un cliente), pero no depende de
 * sus permisos: es parte de completar. Por eso aquí se lee directo, sin elementoPara.
 */
import { esCliente } from '@lucuma-pm/shared';
import { Prisma } from '@prisma/client';
import { HttpError } from '../lib/errores.js';
import { avisar } from './avisos.js';
import { elementoPara } from './elementos.js';
import { registrarEvento } from './eventos.js';
import { mencionables } from './menciones.js';
import { exigir } from './permisos.js';
import { diaEn, sumarDias } from './recordatorios.js';
import { suscribir } from './suscripciones.js';
export const MAX_DIAS_DESPUES = 365;
const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
/** Visibilidad efectiva de una tarea (ella y su lista), leída sin permisos. */
async function visibleParaCliente(tx, tareaId) {
    const t = await tx.recording.findUnique({ where: { id: tareaId }, select: { visibleToClients: true, parent: { select: { visibleToClients: true } } } });
    return !!t?.visibleToClients && !!t.parent?.visibleToClients;
}
/** Deja una tarea esperando a otra: sus responsables pasan a "previstos" y pierde la fecha. */
export async function ponerEnEspera(tx, tareaId, esperaA, previstos, diasDespues) {
    await tx.todoAssignee.deleteMany({ where: { recordingId: tareaId } });
    await tx.todoDetail.upsert({
        where: { recordingId: tareaId },
        create: { recordingId: tareaId, waitsForId: esperaA, pendingAssigneeIds: [...new Set(previstos)], dueAfterDays: diasDespues, dueOn: null },
        update: { waitsForId: esperaA, pendingAssigneeIds: [...new Set(previstos)], dueAfterDays: diasDespues, dueOn: null },
    });
}
/**
 * Activa una tarea que esperaba: asigna a los previstos (los que todavía pueden verla), pone la
 * fecha y avisa. `por` = la tarea cuyo final la activó (null = a mano).
 */
export async function activar(tx, actor, tareaId, por) {
    const d = await tx.todoDetail.findUnique({
        where: { recordingId: tareaId },
        select: { waitsForId: true, pendingAssigneeIds: true, dueAfterDays: true, recording: { select: { projectId: true } } },
    });
    if (!d?.waitsForId)
        return;
    const projectId = d.recording.projectId;
    const visible = await visibleParaCliente(tx, tareaId);
    const pueden = new Set((await mencionables(tx, actor.ctx.accountId, projectId, { incluirClientes: visible })).map((p) => p.userId));
    const entran = ids(d.pendingAssigneeIds).filter((id) => pueden.has(id));
    const zona = (await tx.account.findUniqueOrThrow({ where: { id: actor.ctx.accountId }, select: { timeZone: true } })).timeZone;
    const vence = d.dueAfterDays ? sumarDias(diaEn(zona), d.dueAfterDays - 1) : null;
    await tx.todoDetail.update({
        where: { recordingId: tareaId },
        data: { waitsForId: null, pendingAssigneeIds: Prisma.DbNull, dueAfterDays: null, ...(vence ? { dueOn: new Date(`${vence}T00:00:00Z`) } : {}) },
    });
    if (entran.length) {
        await tx.todoAssignee.createMany({ data: entran.map((userId) => ({ accountId: actor.ctx.accountId, recordingId: tareaId, userId })), skipDuplicates: true });
        await suscribir(tx, { accountId: actor.ctx.accountId, recordingId: tareaId, userIds: entran });
    }
    const eventId = await registrarEvento(tx, {
        accountId: actor.ctx.accountId,
        projectId,
        recordingId: tareaId,
        actorId: actor.ctx.userId,
        action: 'activated',
        details: { userIds: entran, ...(por ? { por } : {}), ...(vence ? { vence } : {}) },
        visibleToClients: visible,
    });
    await avisar(tx, {
        accountId: actor.ctx.accountId,
        eventId,
        recordingId: tareaId,
        actorId: actor.ctx.userId,
        visibleToClients: visible,
        destinatarios: entran.map((userId) => ({ userId, reason: 'assigned' })),
    });
}
/** Al completar una tarea: se activan las que la esperaban (las activas y sin completar). */
export async function activarLasQueEsperan(tx, actor, completadaId) {
    const esperan = await tx.todoDetail.findMany({
        where: { waitsForId: completadaId, completedAt: null, recording: { status: 'active' } },
        select: { recordingId: true },
    });
    for (const e of esperan)
        await activar(tx, actor, e.recordingId, completadaId);
}
/** Si se completa a mano una tarea que esperaba, deja de esperar (sin asignar a nadie). */
export async function olvidarEspera(tx, tareaId) {
    await tx.todoDetail.updateMany({ where: { recordingId: tareaId, waitsForId: { not: null } }, data: { waitsForId: null, pendingAssigneeIds: Prisma.DbNull, dueAfterDays: null } });
}
/**
 * Cambiar la espera desde la tarea (solo el equipo). Con `esperaA`, la tarea pasa a esperar
 * (sus responsables actuales quedan previstos). Con null, se activa ahora.
 */
export async function fijarEspera(tx, actor, tareaId, esperaA, diasDespues) {
    const { proyecto, elemento } = await elementoPara(tx, actor, tareaId, 'elemento.ver');
    if (elemento.type !== 'todo')
        throw new HttpError(404, 'No encontrado.');
    if (esCliente(actor.rol))
        throw new HttpError(403, 'Esto lo define el equipo.');
    exigir(actor, 'tarea.asignar', { proyecto, elemento }, 'Esto lo define el equipo.');
    const d = await tx.todoDetail.findUnique({ where: { recordingId: tareaId }, select: { waitsForId: true, pendingAssigneeIds: true, completedAt: true, dueAfterDays: true } });
    if (esperaA === null) {
        if (d?.waitsForId)
            await activar(tx, actor, tareaId, null);
        return;
    }
    if (d?.completedAt)
        throw new HttpError(400, 'La tarea ya está completada.');
    if (esperaA === tareaId)
        throw new HttpError(400, 'Una tarea no puede esperarse a sí misma.');
    const otra = await tx.recording.findFirst({
        where: { id: esperaA, projectId: proyecto.id, type: 'todo', status: 'active' },
        select: { id: true, todo: { select: { completedAt: true } } },
    });
    if (!otra)
        throw new HttpError(400, 'Solo se espera a otra tarea de este proyecto.');
    if (otra.todo?.completedAt)
        throw new HttpError(400, 'Esa tarea ya está completada: no hay nada que esperar.');
    // Sin vueltas: si la otra (o las que ella espera) espera a esta, nunca se activarían.
    let paso = esperaA;
    for (let i = 0; paso && i < 200; i++) {
        if (paso === tareaId)
            throw new HttpError(400, 'Eso haría que las tareas se esperen entre sí.');
        paso = (await tx.todoDetail.findUnique({ where: { recordingId: paso }, select: { waitsForId: true } }))?.waitsForId ?? null;
    }
    const actuales = (await tx.todoAssignee.findMany({ where: { recordingId: tareaId }, select: { userId: true } })).map((a) => a.userId);
    const previstos = d?.waitsForId ? [...ids(d.pendingAssigneeIds), ...actuales] : actuales;
    const dias = diasDespues !== undefined ? diasDespues : (d?.dueAfterDays ?? null);
    if (dias !== null && (!Number.isInteger(dias) || dias < 1 || dias > MAX_DIAS_DESPUES))
        throw new HttpError(400, `Los días van de 1 a ${MAX_DIAS_DESPUES}.`);
    await ponerEnEspera(tx, tareaId, esperaA, previstos, dias);
}
/** Cambiar a quiénes se asignará cuando se active (mientras espera, "responsables" es esto). */
export async function fijarPrevistos(tx, actor, projectId, tareaId, previstos) {
    const visible = await visibleParaCliente(tx, tareaId);
    const validos = new Set((await mencionables(tx, actor.ctx.accountId, projectId, { incluirClientes: visible })).map((p) => p.userId));
    if (previstos.some((id) => !validos.has(id)))
        throw new HttpError(400, 'Solo se asigna a personas que ven esta tarea.');
    await tx.todoDetail.update({ where: { recordingId: tareaId }, data: { pendingAssigneeIds: [...new Set(previstos)] } });
}
/** Lo que hay que mostrar de las tareas que esperan, de una vez para una lista de tareas. */
export async function esperasDe(tx, actor, filas) {
    const conEspera = filas.filter((f) => f.todo?.waitsForId);
    const r = new Map();
    if (!conEspera.length)
        return r;
    const cliente = esCliente(actor.rol);
    const [otras, personas] = await Promise.all([
        tx.recording.findMany({
            where: { id: { in: conEspera.map((f) => f.todo.waitsForId) } },
            select: { id: true, title: true, status: true, visibleToClients: true, parent: { select: { visibleToClients: true, status: true } } },
        }),
        tx.user.findMany({ where: { id: { in: [...new Set(conEspera.flatMap((f) => ids(f.todo.pendingAssigneeIds)))] } }, select: { id: true, name: true } }),
    ]);
    const otra = new Map(otras.map((o) => [o.id, o]));
    const nombre = new Map(personas.map((p) => [p.id, p.name]));
    for (const f of conEspera) {
        const o = otra.get(f.todo.waitsForId);
        const borrada = !o || o.status !== 'active' || o.parent?.status !== 'active';
        const laVe = !cliente || (!!o?.visibleToClients && !!o.parent?.visibleToClients);
        r.set(f.id, {
            espera: { id: laVe && !borrada ? o.id : null, title: borrada ? 'una tarea que se borró' : laVe ? (o.title ?? '') : 'una tarea del equipo', borrada },
            seAsignaraA: ids(f.todo.pendingAssigneeIds).flatMap((id) => (nombre.has(id) ? [{ userId: id, name: nombre.get(id) }] : [])),
            diasDespues: f.todo.dueAfterDays ?? null,
        });
    }
    return r;
}
