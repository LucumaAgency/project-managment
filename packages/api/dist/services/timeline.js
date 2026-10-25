/**
 * Timeline (13-TABLERO-Y-TIMELINE.md): las tareas con fecha en una línea de tiempo, de un
 * proyecto o de todos los que la persona ve. Una tarea con "desde" (startsOn) y "hasta"
 * (dueOn) es una barra; con una sola fecha, un punto. Para coordinar shoots y entregas.
 *
 * Cada quien ve lo mismo que en Tareas: dueño y admin, todos los proyectos activos; el equipo,
 * los suyos; el cliente, los suyos y solo lo visible (tarea y lista).
 */
import { esCliente, veTodosLosProyectos } from '@lucuma-pm/shared';
import { HttpError } from '../lib/errores.js';
import { columnaDe, tablerosDe } from './tablero.js';
import { aDia } from './tareas.js';
const MAX_DIAS = 120;
const MAX_TAREAS = 600;
const fecha = (d) => new Date(`${d}T00:00:00Z`);
export async function timeline(tx, actor, filtros) {
    const { desde, hasta } = filtros;
    if (![desde, hasta].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)))) {
        throw new HttpError(400, 'Las fechas van como AAAA-MM-DD.');
    }
    const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
    if (dias < 0 || dias > MAX_DIAS)
        throw new HttpError(400, `El rango va de 1 a ${MAX_DIAS} días.`);
    const cliente = esCliente(actor.rol);
    const proyectos = await tx.project.findMany({
        where: {
            accountId: actor.ctx.accountId,
            status: 'active',
            ...(filtros.proyecto ? { id: filtros.proyecto } : {}),
            ...(veTodosLosProyectos(actor.rol) ? {} : { members: { some: { userId: actor.ctx.userId } } }),
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
    });
    if (filtros.proyecto && !proyectos.length)
        throw new HttpError(404, 'No encontrado.');
    const visible = cliente ? { visibleToClients: true } : {};
    // Entra si toca el rango: vence dentro, o empieza dentro, o empieza antes y vence después.
    const enRango = {
        OR: [
            { dueOn: { gte: fecha(desde), lte: fecha(hasta) } },
            { startsOn: { gte: fecha(desde), lte: fecha(hasta) } },
            { startsOn: { lt: fecha(desde) }, dueOn: { gt: fecha(hasta) } },
        ],
    };
    const filas = await tx.recording.findMany({
        where: {
            projectId: { in: proyectos.map((p) => p.id) },
            type: 'todo',
            status: 'active',
            parent: { status: 'active', ...visible },
            todo: enRango,
            ...visible,
        },
        select: {
            id: true,
            title: true,
            projectId: true,
            parentId: true,
            visibleToClients: true,
            parent: { select: { title: true } },
            todo: { select: { dueOn: true, startsOn: true, completedAt: true, columnId: true, startTime: true, endTime: true, location: true } },
            assignees: { select: { user: { select: { id: true, name: true } } } },
        },
        orderBy: [{ todo: { dueOn: { sort: 'asc', nulls: 'last' } } }, { createdAt: 'asc' }],
        take: MAX_TAREAS,
    });
    const tableros = await tablerosDe(tx, [...new Set(filas.map((f) => f.parentId))]);
    return {
        desde,
        hasta,
        proyectos,
        tareas: filas
            .map((f) => {
            const b = tableros.get(f.parentId);
            const col = b?.enabled ? columnaDe(b.columnas, f.todo?.columnId, !!f.todo?.completedAt) : null;
            const vence = aDia(f.todo?.dueOn);
            const empieza = aDia(f.todo?.startsOn);
            return {
                id: f.id,
                title: f.title,
                projectId: f.projectId,
                lista: f.parent?.title ?? null,
                desde: empieza ?? vence,
                hasta: vence ?? empieza,
                completada: !!f.todo?.completedAt,
                hora: f.todo?.startTime ?? null,
                horaFin: f.todo?.endTime ?? null,
                lugar: f.todo?.location ?? null,
                columna: col ? { nombre: col.nombre, tipo: col.tipo ?? null } : null,
                visibleToClients: f.visibleToClients,
                responsables: f.assignees.map((a) => ({ userId: a.user.id, name: a.user.name })),
            };
        })
            // Por día de entrega y, dentro del día, por hora (lo que no tiene hora, al final).
            .sort((a, b) => (a.hasta ?? '').localeCompare(b.hasta ?? '') || (a.hora ?? '99').localeCompare(b.hora ?? '99')),
        recortado: filas.length === MAX_TAREAS,
    };
}
