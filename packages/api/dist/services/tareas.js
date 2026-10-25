/**
 * Tareas: listas (todolist) con tareas (todo). Lo común (crear, editar, papelera, mover,
 * visibilidad, menciones) es el servicio genérico de elementos; aquí va lo propio de una
 * tarea: responsables, fecha, completar y reabrir (TodoDetail y TodoAssignee).
 */
import { esCliente } from '@lucuma-pm/shared';
import { HttpError } from '../lib/errores.js';
import { crearElemento, editarElemento, elementoPara } from './elementos.js';
import { registrarEvento } from './eventos.js';
import { mencionables } from './menciones.js';
import { suscribir } from './suscripciones.js';
import { avisar, seguidoresComo } from './avisos.js';
import { columnaDe, columnaSegunEstado, leerPasos, tablerosDe } from './tablero.js';
import { activarLasQueEsperan, esperasDe, fijarEspera, fijarPrevistos, olvidarEspera } from './espera.js';
import { camposConRespuestas, columnaCampos, fijarCampos, leerCampos, normalizarCampos, puedeResponder, respuestasDe, vistasDeAccesos } from './campos.js';
import { exigir, puede } from './permisos.js';
const SELECCION_TAREA = {
    id: true,
    parentId: true,
    title: true,
    bodyHtml: true,
    body: true,
    visibleToClients: true,
    position: true,
    createdAt: true,
    creator: { select: { id: true, name: true } },
    todo: { select: { dueOn: true, startsOn: true, completedAt: true, completedBy: { select: { id: true, name: true } }, fields: true, waitsForId: true, pendingAssigneeIds: true, dueAfterDays: true, columnId: true, steps: true, startTime: true, endTime: true, location: true } },
    assignees: { select: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
};
/** Fecha sin hora (@db.Date) ↔ "AAAA-MM-DD". */
export const aDia = (d) => (d ? d.toISOString().slice(0, 10) : null);
function desdeDia(s) {
    if (s === null)
        return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
        throw new HttpError(400, 'La fecha va como AAAA-MM-DD.');
    const d = new Date(`${s}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || aDia(d) !== s)
        throw new HttpError(400, 'Esa fecha no existe.');
    return d;
}
function aTarea(f, conCuerpo = false) {
    return {
        id: f.id,
        listaId: f.parentId,
        title: f.title,
        bodyHtml: f.bodyHtml,
        tieneNotas: !!f.bodyHtml,
        ...(conCuerpo ? { body: f.body } : {}),
        visibleToClients: f.visibleToClients,
        position: f.position,
        createdAt: f.createdAt,
        creator: f.creator,
        dueOn: aDia(f.todo?.dueOn),
        /** Desde cuándo (para el timeline: con desde y vence es una barra). */
        startsOn: aDia(f.todo?.startsOn),
        /** Hora y lugar (D-69): "HH:MM" en la hora de la cuenta. */
        hora: f.todo?.startTime ?? null,
        horaFin: f.todo?.endTime ?? null,
        lugar: f.todo?.location ?? null,
        completedAt: f.todo?.completedAt ?? null,
        completedBy: f.todo?.completedBy ?? null,
        assignees: f.assignees.map((a) => ({ userId: a.user.id, name: a.user.name })),
        /** Cuántas cosas pide (D-65); 0 = tarea normal. */
        pide: leerCampos(f.todo?.fields).length,
        /** Pasos dentro de la tarea (D-68): cuántos y cuántos hechos. */
        pasos: (() => {
            const p = leerPasos(f.todo?.steps);
            return { total: p.length, hechos: p.filter((x) => x.hecho).length };
        })(),
    };
}
/** Listas del proyecto con sus tareas, en orden. Un cliente ve solo lo visible. */
export async function listarTareas(tx, actor, proyecto) {
    const cliente = esCliente(actor.rol);
    const visibles = cliente ? { visibleToClients: true } : {};
    const listas = await tx.recording.findMany({
        where: { projectId: proyecto.id, type: 'todolist', parentId: null, status: 'active', ...visibles },
        select: { id: true, title: true, bodyHtml: true, body: true, visibleToClients: true, position: true, creatorId: true },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    const tareas = (await tx.recording.findMany({
        where: { projectId: proyecto.id, type: 'todo', status: 'active', parentId: { in: listas.map((l) => l.id) }, ...visibles },
        select: SELECCION_TAREA,
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    }));
    // Cuántos comentarios tiene cada tarea (los que la persona puede ver).
    const conteos = await tx.recording.groupBy({
        by: ['parentId'],
        where: { type: 'comment', status: 'active', parentId: { in: tareas.map((t) => t.id) }, ...visibles },
        _count: { _all: true },
    });
    const comentariosDe = new Map(conteos.map((c) => [c.parentId, c._count._all]));
    const esperas = await esperasDe(tx, actor, tareas);
    const tableros = await tablerosDe(tx, listas.map((l) => l.id));
    const conCampos = tareas.filter((t) => leerCampos(t.todo?.fields).length).map((t) => t.id);
    const respondidos = conCampos.length
        ? new Map((await tx.taskAnswer.groupBy({ by: ['recordingId'], where: { recordingId: { in: conCampos } }, _count: { _all: true } })).map((r) => [r.recordingId, r._count._all]))
        : new Map();
    const permisoLista = (l) => {
        const elemento = {
            id: l.id,
            type: 'todolist',
            creatorId: l.creatorId,
            status: 'active',
            visibleEnCadena: l.visibleToClients,
            padreInactivo: false,
        };
        return {
            editar: puede(actor, 'elemento.editar', { proyecto, elemento }),
            papelera: puede(actor, 'elemento.papelera', { proyecto, elemento }),
            agregar: puede(actor, 'elemento.crear', { proyecto, elemento, tipo: 'todo' }),
            mover: puede(actor, 'elemento.mover', { proyecto, elemento }),
            visibilidad: puede(actor, 'elemento.cambiarVisibilidad', { proyecto, elemento }),
        };
    };
    return {
        listas: listas.map((l) => ({
            id: l.id,
            title: l.title,
            bodyHtml: l.bodyHtml,
            body: l.body,
            visibleToClients: l.visibleToClients,
            position: l.position,
            permisos: permisoLista(l),
            // Tablero (D-68): si la lista se ve por columnas, y en cuál está cada tarjeta.
            tablero: tableros.get(l.id) ?? null,
            tareas: tareas
                .filter((t) => t.parentId === l.id)
                .map((t) => ({
                ...aTarea(t),
                comentarios: comentariosDe.get(t.id) ?? 0,
                respondidos: respondidos.get(t.id) ?? 0,
                espera: esperas.get(t.id) ?? null,
                columna: tableros.has(l.id) ? columnaDe(tableros.get(l.id).columnas, t.todo?.columnId, !!t.todo?.completedAt).id : null,
            })),
        })),
        permisos: {
            crearLista: puede(actor, 'elemento.crear', { proyecto, tipo: 'todolist' }),
            // Lo que vale para cualquier tarea del proyecto (la web lo usa en la lista).
            completarCualquiera: !cliente && (actor.rol === 'owner' || actor.rol === 'admin' || proyecto.esMiembro) && proyecto.status === 'active',
            asignar: !cliente && (actor.rol === 'owner' || actor.rol === 'admin' || proyecto.esMiembro) && proyecto.status === 'active',
        },
    };
}
async function esAsignado(tx, tareaId, userId) {
    return !!(await tx.todoAssignee.findUnique({ where: { recordingId_userId: { recordingId: tareaId, userId } } }));
}
/** Detalle de una tarea con el documento de las notas (para editarlo) y lo que puedo hacer. */
export async function tareaDetalle(tx, actor, id) {
    const { proyecto, elemento } = await elementoPara(tx, actor, id, 'elemento.ver');
    if (elemento.type !== 'todo')
        throw new HttpError(404, 'No encontrado.');
    const fila = (await tx.recording.findUniqueOrThrow({ where: { id }, select: SELECCION_TAREA }));
    const asignado = fila.assignees.some((a) => a.user.id === actor.ctx.userId);
    const campos = leerCampos(fila.todo?.fields);
    const respuestas = campos.length ? (await respuestasDe(tx, [id])).get(id) : undefined;
    return {
        tarea: {
            ...aTarea(fila, true),
            visibleParaCliente: elemento.visibleEnCadena,
            campos: camposConRespuestas(campos, respuestas),
            espera: (await esperasDe(tx, actor, [fila])).get(id) ?? null,
            pasos: await pasosConNombres(tx, fila.todo?.steps),
            tablero: await tableroDeTarea(tx, fila),
            // Quién vio los accesos protegidos (D-66): solo para el equipo.
            ...(campos.some((c) => c.tipo === 'acceso') && !esCliente(actor.rol) ? { vistasAccesos: await vistasDeAccesos(tx, id) } : {}),
        },
        permisos: {
            editar: puede(actor, 'elemento.editar', { proyecto, elemento }),
            completar: puede(actor, 'tarea.completar', { proyecto, elemento, esAsignado: asignado }),
            asignar: puede(actor, 'tarea.asignar', { proyecto, elemento }),
            papelera: puede(actor, 'elemento.papelera', { proyecto, elemento }),
            cambiarVisibilidad: puede(actor, 'elemento.cambiarVisibilidad', { proyecto, elemento }),
            mover: puede(actor, 'elemento.mover', { proyecto, elemento }),
            responder: campos.length > 0 && (await puedeResponder(tx, actor, proyecto, elemento)),
            // Pasos: cambiarlos es del equipo; marcarlos, de quien puede completar.
            pasos: !esCliente(actor.rol) && puede(actor, 'elemento.editar', { proyecto, elemento }),
            marcarPasos: puede(actor, 'tarea.completar', { proyecto, elemento, esAsignado: asignado }),
            // Qué pide la tarea lo define el equipo.
            pedir: !esCliente(actor.rol) && puede(actor, 'elemento.editar', { proyecto, elemento }),
        },
    };
}
/**
 * Responsables: solo personas que pueden ver la tarea (las mismas que se pueden mencionar).
 * Reemplaza el conjunto y registra quién entró y quién salió.
 */
async function fijarResponsables(tx, actor, datos) {
    const validos = new Map((await mencionables(tx, actor.ctx.accountId, datos.projectId, { incluirClientes: datos.visibleParaClientes })).map((p) => [p.userId, p]));
    const pedidos = [...new Set(datos.ids)];
    const invalido = pedidos.find((id) => !validos.has(id));
    if (invalido)
        throw new HttpError(400, 'Solo se puede asignar a personas que ven esta tarea.');
    const antes = (await tx.todoAssignee.findMany({ where: { recordingId: datos.tareaId }, select: { userId: true } })).map((a) => a.userId);
    const entran = pedidos.filter((id) => !antes.includes(id));
    const salen = antes.filter((id) => !pedidos.includes(id));
    if (salen.length)
        await tx.todoAssignee.deleteMany({ where: { recordingId: datos.tareaId, userId: { in: salen } } });
    if (entran.length) {
        await tx.todoAssignee.createMany({ data: entran.map((userId) => ({ accountId: actor.ctx.accountId, recordingId: datos.tareaId, userId })) });
        // A quien asignan, sigue la tarea.
        await suscribir(tx, { accountId: actor.ctx.accountId, recordingId: datos.tareaId, userIds: entran });
    }
    const base = { accountId: actor.ctx.accountId, projectId: datos.projectId, recordingId: datos.tareaId, actorId: actor.ctx.userId, visibleToClients: datos.visibleParaClientes };
    if (entran.length) {
        const eventId = await registrarEvento(tx, { ...base, action: 'assigned', details: { userIds: entran } });
        await avisar(tx, {
            accountId: actor.ctx.accountId,
            eventId,
            recordingId: datos.tareaId,
            actorId: actor.ctx.userId,
            visibleToClients: datos.visibleParaClientes,
            destinatarios: entran.map((userId) => ({ userId, reason: 'assigned' })),
        });
    }
    if (salen.length)
        await registrarEvento(tx, { ...base, action: 'unassigned', details: { userIds: salen } });
}
/** Tras pasar a interna, un cliente responsable ya no puede verla: deja de ser responsable. */
async function quitarClientesSiEsInterna(tx, actor, tareaId, visible) {
    if (visible)
        return;
    const clientes = await tx.membership.findMany({ where: { accountId: actor.ctx.accountId, role: 'client' }, select: { userId: true } });
    await tx.todoAssignee.deleteMany({ where: { recordingId: tareaId, userId: { in: clientes.map((c) => c.userId) } } });
}
export async function crearTarea(tx, actor, listaId, datos) {
    const { proyecto, elemento: lista } = await elementoPara(tx, actor, listaId, 'elemento.ver');
    if (lista.type !== 'todolist')
        throw new HttpError(400, 'Las tareas van dentro de una lista.');
    if ((datos.assigneeIds?.length || datos.dueOn || datos.startsOn || datos.hora || datos.lugar) && esCliente(actor.rol)) {
        throw new HttpError(403, 'Los responsables y la fecha los pone el equipo.');
    }
    if (datos.campos != null && esCliente(actor.rol))
        throw new HttpError(403, 'Lo que pide una tarea lo define el equipo.');
    const campos = normalizarCampos(datos.campos);
    const creada = await crearElemento(tx, actor, proyecto.id, {
        type: 'todo',
        parentId: listaId,
        title: datos.title,
        body: datos.body,
        visibleToClients: datos.visibleToClients,
    });
    const visible = creada.visibleToClients && lista.visibleEnCadena;
    const [vence, empieza] = [desdeDia(datos.dueOn ?? null), desdeDia(datos.startsOn ?? null)];
    if (vence && empieza && empieza > vence)
        throw new HttpError(400, 'La fecha de inicio va antes de la de entrega.');
    await tx.todoDetail.create({ data: { recordingId: creada.id, dueOn: vence, startsOn: empieza, fields: columnaCampos(campos), ...horaYLugar(datos, {}) } });
    if (datos.esperaA) {
        // Nace esperando: los responsables quedan previstos y no se les avisa todavía.
        await tx.todoAssignee.deleteMany({ where: { recordingId: creada.id } });
        await tx.todoDetail.update({ where: { recordingId: creada.id }, data: { pendingAssigneeIds: [] } });
        await fijarEspera(tx, actor, creada.id, datos.esperaA, datos.diasDespues ?? null);
        if (datos.assigneeIds?.length)
            await fijarPrevistos(tx, actor, proyecto.id, creada.id, datos.assigneeIds);
    }
    else if (datos.assigneeIds?.length) {
        await fijarResponsables(tx, actor, { projectId: proyecto.id, tareaId: creada.id, ids: datos.assigneeIds, visibleParaClientes: visible });
    }
    return (await tareaDetalle(tx, actor, creada.id)).tarea;
}
export async function editarTarea(tx, actor, id, datos) {
    const { proyecto, elemento } = await elementoPara(tx, actor, id, 'elemento.ver');
    if (elemento.type !== 'todo')
        throw new HttpError(404, 'No encontrado.');
    const generales = { title: datos.title, body: datos.body, visibleToClients: datos.visibleToClients };
    if (Object.values(generales).some((v) => v !== undefined))
        await editarElemento(tx, actor, id, generales);
    if (datos.campos !== undefined)
        await fijarCampos(tx, actor, id, datos.campos);
    if (datos.esperaA !== undefined)
        await fijarEspera(tx, actor, id, datos.esperaA, datos.diasDespues);
    else if (datos.diasDespues !== undefined) {
        exigir(actor, 'tarea.asignar', { proyecto, elemento }, 'Esto lo define el equipo.');
        if (datos.diasDespues !== null && (!Number.isInteger(datos.diasDespues) || datos.diasDespues < 1 || datos.diasDespues > 365))
            throw new HttpError(400, 'Los días van de 1 a 365.');
        await tx.todoDetail.updateMany({ where: { recordingId: id, waitsForId: { not: null } }, data: { dueAfterDays: datos.diasDespues } });
    }
    const espera = await tx.todoDetail.findUnique({ where: { recordingId: id }, select: { waitsForId: true } });
    if (datos.hora !== undefined || datos.horaFin !== undefined || datos.lugar !== undefined) {
        exigir(actor, 'tarea.asignar', { proyecto, elemento }, 'La hora y el lugar los pone el equipo.');
        const actual = await tx.todoDetail.findUnique({ where: { recordingId: id }, select: { startTime: true, endTime: true, location: true } });
        const nuevos = horaYLugar(datos, { hora: actual?.startTime ?? null, horaFin: actual?.endTime ?? null, lugar: actual?.location ?? null });
        await tx.todoDetail.upsert({ where: { recordingId: id }, create: { recordingId: id, ...nuevos }, update: nuevos });
    }
    if (datos.startsOn !== undefined) {
        exigir(actor, 'tarea.asignar', { proyecto, elemento }, 'Las fechas las pone el equipo.');
        const empieza = desdeDia(datos.startsOn);
        const actual = await tx.todoDetail.findUnique({ where: { recordingId: id }, select: { dueOn: true } });
        const vence = datos.dueOn !== undefined ? desdeDia(datos.dueOn) : (actual?.dueOn ?? null);
        if (empieza && vence && empieza > vence)
            throw new HttpError(400, 'La fecha de inicio va antes de la de entrega.');
        await tx.todoDetail.upsert({ where: { recordingId: id }, create: { recordingId: id, startsOn: empieza }, update: { startsOn: empieza } });
    }
    if (datos.dueOn !== undefined || datos.assigneeIds !== undefined) {
        exigir(actor, 'tarea.asignar', { proyecto, elemento }, 'Los responsables y la fecha los pone el equipo.');
    }
    const { elemento: ahora } = await elementoPara(tx, actor, id, 'elemento.ver');
    if (datos.dueOn !== undefined) {
        const nueva = desdeDia(datos.dueOn);
        const detalle = await tx.todoDetail.upsert({
            where: { recordingId: id },
            create: { recordingId: id, dueOn: nueva },
            update: {},
            select: { dueOn: true },
        });
        if (aDia(detalle.dueOn) !== aDia(nueva)) {
            await tx.todoDetail.update({ where: { recordingId: id }, data: { dueOn: nueva } });
            await registrarEvento(tx, {
                accountId: actor.ctx.accountId,
                projectId: proyecto.id,
                recordingId: id,
                actorId: actor.ctx.userId,
                action: 'due_changed',
                details: { from: aDia(detalle.dueOn), to: aDia(nueva) },
                visibleToClients: ahora.visibleEnCadena,
            });
        }
    }
    if (datos.assigneeIds !== undefined && espera?.waitsForId) {
        // Mientras espera, los responsables son los previstos: se asignan (y se avisa) al activarse.
        await fijarPrevistos(tx, actor, proyecto.id, id, datos.assigneeIds);
    }
    else if (datos.assigneeIds !== undefined) {
        await fijarResponsables(tx, actor, { projectId: proyecto.id, tareaId: id, ids: datos.assigneeIds, visibleParaClientes: ahora.visibleEnCadena });
    }
    else if (datos.visibleToClients === false) {
        await quitarClientesSiEsInterna(tx, actor, id, ahora.visibleEnCadena);
    }
    return (await tareaDetalle(tx, actor, id)).tarea;
}
export async function completarTarea(tx, actor, id, completar) {
    const { proyecto, elemento } = await elementoPara(tx, actor, id, 'elemento.ver');
    if (elemento.type !== 'todo')
        throw new HttpError(404, 'No encontrado.');
    exigir(actor, 'tarea.completar', { proyecto, elemento, esAsignado: await esAsignado(tx, id, actor.ctx.userId) }, 'Solo el equipo, o quien la tiene asignada, puede completarla.');
    await cambiarCompletada(tx, actor, { projectId: proyecto.id, visible: elemento.visibleEnCadena }, id, completar);
    return (await tareaDetalle(tx, actor, id)).tarea;
}
/**
 * Completar o reabrir SIN revisar permisos (lo revisa quien llama: completarTarea, o aprobar
 * en el tablero). Registra el evento, avisa, activa las que esperaban y pone la tarjeta en la
 * columna que corresponde.
 */
export async function cambiarCompletada(tx, actor, donde, id, completar, accion) {
    const proyecto = { id: donde.projectId };
    const elemento = { visibleEnCadena: donde.visible };
    const detalle = await tx.todoDetail.upsert({ where: { recordingId: id }, create: { recordingId: id }, update: {}, select: { completedAt: true } });
    if (!!detalle.completedAt === completar)
        return; // ya estaba así
    await tx.todoDetail.update({
        where: { recordingId: id },
        data: completar ? { completedAt: new Date(), completedById: actor.ctx.userId } : { completedAt: null, completedById: null },
    });
    const eventId = await registrarEvento(tx, {
        accountId: actor.ctx.accountId,
        projectId: proyecto.id,
        recordingId: id,
        actorId: actor.ctx.userId,
        action: accion ?? (completar ? 'completed' : 'reopened'),
        visibleToClients: elemento.visibleEnCadena,
    });
    // Completar avisa a quienes siguen la tarea (reabrir no: suele ser una corrección), y activa
    // las tareas que la esperaban (D-67).
    await columnaSegunEstado(tx, id, completar);
    if (completar) {
        await olvidarEspera(tx, id);
        await activarLasQueEsperan(tx, actor, id);
        await avisar(tx, {
            accountId: actor.ctx.accountId,
            eventId,
            recordingId: id,
            actorId: actor.ctx.userId,
            visibleToClients: elemento.visibleEnCadena,
            destinatarios: await seguidoresComo(tx, id),
        });
    }
}
/** Para campos.ts: completar cuando ya está todo lo que pide. */
export const completarPorRespuestas = (tx, actor, id) => completarTarea(tx, actor, id, true);
/** Activar ahora una tarea que espera (el equipo, por ejemplo si la anterior se borró). */
export async function activarAhora(tx, actor, id) {
    await fijarEspera(tx, actor, id, null);
    return (await tareaDetalle(tx, actor, id)).tarea;
}
/** Pasos con el nombre de quien marcó cada uno. */
async function pasosConNombres(tx, json) {
    const pasos = leerPasos(json);
    const ids = [...new Set(pasos.flatMap((p) => (p.porId ? [p.porId] : [])))];
    const nombres = new Map((ids.length ? await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
    return pasos.map((p) => ({ id: p.id, texto: p.texto, hecho: p.hecho, por: p.porId ? (nombres.get(p.porId) ?? null) : null, el: p.el ?? null }));
}
/** Columnas del tablero de la lista de una tarea y en cuál está (null si su lista no es tablero). */
async function tableroDeTarea(tx, fila) {
    if (!fila.parentId)
        return null;
    const b = (await tablerosDe(tx, [fila.parentId])).get(fila.parentId);
    if (!b)
        return null;
    return { enabled: b.enabled, columnas: b.columnas, columna: columnaDe(b.columnas, fila.todo?.columnId, !!fila.todo?.completedAt).id };
}
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
/**
 * Valida hora, hora de fin y lugar (D-69). Lo que no viene queda como estaba (`antes`).
 * Sin hora no hay hora de fin; la de fin va después de la de inicio (el mismo día).
 */
function horaYLugar(datos, antes) {
    const hora = datos.hora !== undefined ? datos.hora || null : (antes.hora ?? null);
    let horaFin = datos.horaFin !== undefined ? datos.horaFin || null : (antes.horaFin ?? null);
    const lugar = datos.lugar !== undefined ? datos.lugar?.trim().slice(0, 200) || null : (antes.lugar ?? null);
    if (hora && !HORA.test(hora))
        throw new HttpError(400, 'La hora va como HH:MM (24 horas).');
    if (horaFin && !HORA.test(horaFin))
        throw new HttpError(400, 'La hora de fin va como HH:MM (24 horas).');
    if (!hora)
        horaFin = null;
    if (hora && horaFin && horaFin <= hora)
        throw new HttpError(400, 'La hora de fin va después de la de inicio.');
    return { startTime: hora, endTime: horaFin, location: lugar };
}
