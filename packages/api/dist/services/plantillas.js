/**
 * Plantillas de lista (D-64, documentacion/12-PLANTILLAS-Y-FLUJOS.md): el onboarding de un
 * cliente o los pasos de un servicio, escritos una vez. Agregar una plantilla a un proyecto crea
 * una lista con sus tareas usando los mismos servicios que la web (eventos, avisos,
 * suscripciones y permisos incluidos), así que es como si alguien las hubiera creado a mano.
 *
 * Sin roles: cada tarea dice si es del equipo (interna), del cliente (se le asigna y la ve) o
 * de cualquiera (equipo y cliente asignados, visible). Las fechas son "día N" desde el inicio.
 *
 * Quién: el equipo (no clientes) ve las plantillas y las agrega; dueño y admin las crean,
 * editan y borran.
 */
import { esCliente, veTodosLosProyectos } from '@lucuma-pm/shared';
import { documentoDesdeTexto } from '../lib/documento.js';
import { HttpError } from '../lib/errores.js';
import { columnaCampos, leerCampos, normalizarCampos } from './campos.js';
import { crearElemento, elementoPara } from './elementos.js';
import { mencionables } from './menciones.js';
import { exigir } from './permisos.js';
import { proyectoPara } from './proyectos.js';
import { diaEn, sumarDias } from './recordatorios.js';
import { crearTarea } from './tareas.js';
export const MAX_TAREAS_PLANTILLA = 100;
export const MAX_DIA = 365;
function exigirEquipo(actor) {
    if (esCliente(actor.rol))
        throw new HttpError(404, 'No encontrado.');
}
function exigirGestion(actor) {
    exigirEquipo(actor);
    if (!veTodosLosProyectos(actor.rol))
        throw new HttpError(403, 'Solo el dueño o un administrador edita las plantillas.');
}
const SELECCION = {
    id: true,
    name: true,
    description: true,
    updatedAt: true,
    items: {
        select: { id: true, title: true, notes: true, audience: true, dayOffset: true, position: true, fields: true, waitsFor: true },
        orderBy: { position: 'asc' },
    },
};
function resumen(p) {
    return {
        id: p.id,
        name: p.name,
        description: p.description,
        updatedAt: p.updatedAt,
        tareas: p.items.length,
        delCliente: p.items.filter((i) => i.audience !== 'team').length,
    };
}
export async function listarPlantillas(tx, actor) {
    exigirEquipo(actor);
    const filas = await tx.listTemplate.findMany({
        where: { accountId: actor.ctx.accountId },
        select: { id: true, name: true, description: true, updatedAt: true, items: { select: { audience: true } } },
        orderBy: { name: 'asc' },
    });
    return { plantillas: filas.map(resumen), permisos: { gestionar: veTodosLosProyectos(actor.rol) } };
}
async function cargar(tx, actor, id) {
    const p = await tx.listTemplate.findFirst({ where: { id, accountId: actor.ctx.accountId }, select: SELECCION });
    if (!p)
        throw new HttpError(404, 'No encontrado.');
    return p;
}
export async function plantillaDetalle(tx, actor, id) {
    exigirEquipo(actor);
    const p = await cargar(tx, actor, id);
    return {
        plantilla: { ...resumen(p), items: p.items.map(({ position: _, fields, ...i }) => ({ ...i, campos: leerCampos(fields) })) },
        permisos: { gestionar: veTodosLosProyectos(actor.rol) },
    };
}
function limpiar(datos) {
    const name = datos.name.trim();
    if (!name)
        throw new HttpError(400, 'Falta el nombre de la plantilla.');
    // Las filas sin título se descartan: las esperas se renumeran a las posiciones nuevas.
    const nuevaPos = new Map();
    datos.items.forEach((i, n) => i.title.trim() && nuevaPos.set(n + 1, nuevaPos.size + 1));
    const items = datos.items
        .filter((i) => i.title.trim())
        .map((i, n) => {
        const espera = i.waitsFor ? (nuevaPos.get(i.waitsFor) ?? null) : null;
        if (i.waitsFor && (!Number.isInteger(i.waitsFor) || !espera || espera >= n + 1)) {
            throw new HttpError(400, `«${i.title.trim()}» solo puede esperar a una tarea anterior de la plantilla.`);
        }
        return { ...i, title: i.title.trim(), notes: i.notes?.trim() || null, campos: normalizarCampos(i.campos), waitsFor: espera };
    });
    if (items.length > MAX_TAREAS_PLANTILLA)
        throw new HttpError(400, `Una plantilla tiene como máximo ${MAX_TAREAS_PLANTILLA} tareas.`);
    for (const i of items) {
        if (i.dayOffset != null && (!Number.isInteger(i.dayOffset) || i.dayOffset < 1 || i.dayOffset > MAX_DIA)) {
            throw new HttpError(400, `El día va de 1 a ${MAX_DIA} (1 = el día de inicio).`);
        }
    }
    return { name, description: datos.description?.trim() || null, items };
}
/** Crea (id null) o reemplaza una plantilla entera: nombre, descripción y tareas en orden. */
export async function guardarPlantilla(tx, actor, id, datos) {
    exigirGestion(actor);
    const { name, description, items } = limpiar(datos);
    const accountId = actor.ctx.accountId;
    let plantillaId = id;
    if (plantillaId) {
        await cargar(tx, actor, plantillaId);
        await tx.listTemplate.update({ where: { id: plantillaId }, data: { name, description } });
        await tx.listTemplateItem.deleteMany({ where: { templateId: plantillaId } });
    }
    else {
        plantillaId = (await tx.listTemplate.create({ data: { accountId, name, description, createdById: actor.ctx.userId }, select: { id: true } })).id;
    }
    if (items.length) {
        await tx.listTemplateItem.createMany({
            data: items.map((i, n) => ({
                accountId,
                templateId: plantillaId,
                title: i.title,
                notes: i.notes,
                audience: i.audience,
                dayOffset: i.dayOffset ?? null,
                fields: columnaCampos(i.campos),
                waitsFor: i.waitsFor ?? null,
                position: n + 1,
            })),
        });
    }
    return plantillaDetalle(tx, actor, plantillaId);
}
export async function borrarPlantilla(tx, actor, id) {
    exigirGestion(actor);
    await cargar(tx, actor, id);
    await tx.listTemplate.delete({ where: { id } });
}
const diferenciaDias = (desde, hasta) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
/**
 * "Guardar como plantilla" desde una lista que salió bien. Las fechas pasan a "día N" contando
 * desde el día en que se creó la lista; las personas no se guardan, solo para quién es:
 * interna → equipo; visible y solo con clientes responsables → cliente; otra visible → cualquiera.
 */
export async function plantillaDesdeLista(tx, actor, listaId, nombre) {
    exigirGestion(actor);
    const { elemento } = await elementoPara(tx, actor, listaId, 'elemento.ver');
    if (elemento.type !== 'todolist')
        throw new HttpError(400, 'Solo una lista de tareas se guarda como plantilla.');
    const lista = await tx.recording.findUniqueOrThrow({ where: { id: listaId }, select: { title: true, bodyText: true, createdAt: true } });
    const tareas = await tx.recording.findMany({
        where: { parentId: listaId, type: 'todo', status: 'active' },
        select: {
            title: true,
            bodyText: true,
            visibleToClients: true,
            id: true,
            todo: { select: { dueOn: true, fields: true, waitsForId: true, pendingAssigneeIds: true, dueAfterDays: true } },
            assignees: { select: { userId: true } },
        },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    const clientes = new Set((await tx.membership.findMany({ where: { accountId: actor.ctx.accountId, role: 'client' }, select: { userId: true } })).map((m) => m.userId));
    const zona = (await tx.account.findUniqueOrThrow({ where: { id: actor.ctx.accountId }, select: { timeZone: true } })).timeZone;
    const inicio = diaEn(zona, lista.createdAt);
    const posicion = new Map(tareas.map((t, n) => [t.id, n + 1]));
    const items = tareas.map((t, n) => {
        // Una tarea que espera guarda a quién se asignará; eso dice para quién es.
        const quienes = t.todo?.waitsForId ? (Array.isArray(t.todo.pendingAssigneeIds) ? t.todo.pendingAssigneeIds.map((userId) => ({ userId })) : []) : t.assignees;
        const deCliente = quienes.filter((a) => clientes.has(a.userId)).length;
        const audience = !(t.visibleToClients && elemento.visibleEnCadena)
            ? 'team'
            : deCliente > 0 && deCliente === quienes.length
                ? 'client'
                : 'any';
        const vence = t.todo?.dueOn?.toISOString().slice(0, 10);
        return {
            title: t.title ?? '',
            notes: t.bodyText,
            audience,
            dayOffset: t.todo?.waitsForId ? (t.todo.dueAfterDays ?? null) : vence ? Math.min(MAX_DIA, Math.max(1, diferenciaDias(inicio, vence) + 1)) : null,
            campos: leerCampos(t.todo?.fields),
            // Solo si espera a una tarea anterior de la misma lista (si no, se pierde la espera).
            waitsFor: t.todo?.waitsForId && (posicion.get(t.todo.waitsForId) ?? Infinity) < n + 1 ? posicion.get(t.todo.waitsForId) : null,
        };
    });
    return guardarPlantilla(tx, actor, null, { name: nombre?.trim() || lista.title || 'Plantilla', description: lista.bodyText, items });
}
/** Agrega una plantilla a un proyecto: una lista nueva con sus tareas, fechas y responsables. */
export async function aplicarPlantilla(tx, actor, projectId, datos) {
    exigirEquipo(actor);
    const proyecto = await proyectoPara(tx, actor, projectId, 'proyecto.ver');
    exigir(actor, 'elemento.crear', { proyecto, tipo: 'todolist' }, 'No puedes agregar listas en este proyecto.');
    const plantilla = await cargar(tx, actor, datos.plantillaId);
    const personas = await mencionables(tx, actor.ctx.accountId, projectId, { incluirClientes: true });
    const equipo = personas.filter((p) => p.role !== 'client');
    const clientesDelProyecto = personas.filter((p) => p.role === 'client');
    const yo = await tx.user.findUniqueOrThrow({ where: { id: actor.ctx.userId }, select: { isBot: true } });
    const responsableId = datos.responsableId !== undefined ? datos.responsableId : yo.isBot ? null : actor.ctx.userId;
    if (responsableId && !equipo.some((p) => p.userId === responsableId)) {
        throw new HttpError(400, 'El responsable tiene que ser alguien del equipo que vea el proyecto.');
    }
    const clienteIds = datos.clienteIds ?? clientesDelProyecto.map((p) => p.userId);
    if (clienteIds.some((id) => !clientesDelProyecto.some((p) => p.userId === id))) {
        throw new HttpError(400, 'Solo se asignan tareas a clientes que están en el proyecto.');
    }
    const zona = (await tx.account.findUniqueOrThrow({ where: { id: actor.ctx.accountId }, select: { timeZone: true } })).timeZone;
    const inicio = datos.inicio ?? diaEn(zona);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || Number.isNaN(Date.parse(`${inicio}T00:00:00Z`))) {
        throw new HttpError(400, 'La fecha de inicio va como AAAA-MM-DD.');
    }
    const conCliente = plantilla.items.some((i) => i.audience !== 'team');
    const lista = await crearElemento(tx, actor, projectId, {
        type: 'todolist',
        title: datos.titulo?.trim() || plantilla.name,
        bodyText: plantilla.description ?? undefined,
        visibleToClients: conCliente,
    });
    const equipoIds = responsableId ? [responsableId] : [];
    const creadas = new Map(); // posición → tarea creada
    for (const i of plantilla.items) {
        const esperaA = i.waitsFor ? creadas.get(i.waitsFor) : undefined;
        const t = await crearTarea(tx, actor, lista.id, {
            title: i.title,
            ...(i.notes ? { body: documentoDesdeTexto(i.notes) } : {}),
            visibleToClients: i.audience !== 'team',
            // Si espera a otra, "día N" cuenta desde que se activa (D-67).
            dueOn: i.dayOffset && !esperaA ? sumarDias(inicio, i.dayOffset - 1) : null,
            assigneeIds: i.audience === 'team' ? equipoIds : i.audience === 'client' ? clienteIds : [...equipoIds, ...clienteIds],
            campos: leerCampos(i.fields),
            ...(esperaA ? { esperaA, diasDespues: i.dayOffset ?? null } : {}),
        });
        creadas.set(i.position, t.id);
    }
    return {
        lista: { id: lista.id, title: lista.title },
        tareas: plantilla.items.length,
        inicio,
        sinCliente: conCliente && clienteIds.length === 0,
    };
}
