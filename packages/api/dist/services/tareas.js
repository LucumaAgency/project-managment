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
    todo: { select: { dueOn: true, completedAt: true, completedBy: { select: { id: true, name: true } }, fields: true } },
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
        completedAt: f.todo?.completedAt ?? null,
        completedBy: f.todo?.completedBy ?? null,
        assignees: f.assignees.map((a) => ({ userId: a.user.id, name: a.user.name })),
        /** Cuántas cosas pide (D-65); 0 = tarea normal. */
        pide: leerCampos(f.todo?.fields).length,
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
            tareas: tareas.filter((t) => t.parentId === l.id).map((t) => ({ ...aTarea(t), comentarios: comentariosDe.get(t.id) ?? 0, respondidos: respondidos.get(t.id) ?? 0 })),
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
    if ((datos.assigneeIds?.length || datos.dueOn) && esCliente(actor.rol)) {
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
    await tx.todoDetail.create({ data: { recordingId: creada.id, dueOn: desdeDia(datos.dueOn ?? null), fields: columnaCampos(campos) } });
    if (datos.assigneeIds?.length) {
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
    if (datos.assigneeIds !== undefined) {
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
    const detalle = await tx.todoDetail.upsert({ where: { recordingId: id }, create: { recordingId: id }, update: {}, select: { completedAt: true } });
    if (!!detalle.completedAt === completar)
        return (await tareaDetalle(tx, actor, id)).tarea; // ya estaba así
    await tx.todoDetail.update({
        where: { recordingId: id },
        data: completar ? { completedAt: new Date(), completedById: actor.ctx.userId } : { completedAt: null, completedById: null },
    });
    const eventId = await registrarEvento(tx, {
        accountId: actor.ctx.accountId,
        projectId: proyecto.id,
        recordingId: id,
        actorId: actor.ctx.userId,
        action: completar ? 'completed' : 'reopened',
        visibleToClients: elemento.visibleEnCadena,
    });
    // Completar avisa a quienes siguen la tarea (reabrir no: suele ser una corrección).
    if (completar) {
        await avisar(tx, {
            accountId: actor.ctx.accountId,
            eventId,
            recordingId: id,
            actorId: actor.ctx.userId,
            visibleToClients: elemento.visibleEnCadena,
            destinatarios: await seguidoresComo(tx, id),
        });
    }
    return (await tareaDetalle(tx, actor, id)).tarea;
}
/** Para campos.ts: completar cuando ya está todo lo que pide. */
export const completarPorRespuestas = (tx, actor, id) => completarTarea(tx, actor, id, true);
