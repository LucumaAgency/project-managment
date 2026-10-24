/**
 * Actividad del proyecto: los eventos que se escriben con cada cambio (services/eventos.ts),
 * del más nuevo al más viejo, con lo necesario para armar la frase ("María completó «Logo»")
 * y el enlace.
 *
 * Un cliente ve solo eventos marcados visibles al momento Y cuyo elemento sigue siendo visible
 * hoy (con toda su cadena): si algo pasó a interno, su historial también deja de verse.
 */
import { esCliente } from '@lucuma-pm/shared';
import { visiblesParaCliente } from './elementos.js';
const POR_PAGINA = 30;
export async function actividadDelProyecto(tx, actor, proyecto, opciones = {}) {
    const cliente = esCliente(actor.rol);
    const limite = Math.min(opciones.limite ?? POR_PAGINA, 100);
    const where = {
        projectId: proyecto.id,
        ...(opciones.antes ? { createdAt: { lt: opciones.antes } } : {}),
        ...(cliente ? { visibleToClients: true, recordingId: { not: null } } : {}),
    };
    // Un cliente puede necesitar más de una vuelta si muchos eventos ya no son visibles.
    const eventos = [];
    let cursor = opciones.antes;
    let masEnBase = false;
    for (let vuelta = 0; vuelta < 5 && eventos.length <= limite; vuelta++) {
        const lote = await buscar(tx, { ...where, ...(cursor ? { createdAt: { lt: cursor } } : {}) }, limite + 1);
        masEnBase = lote.length > limite;
        if (!lote.length)
            break;
        let utiles = lote;
        if (cliente) {
            const ok = await visiblesParaCliente(tx, lote.map((e) => e.recordingId));
            utiles = lote.filter((e) => ok.has(e.recordingId));
        }
        eventos.push(...utiles);
        cursor = lote[lote.length - 1].createdAt;
        if (!masEnBase)
            break;
    }
    const pagina = eventos.slice(0, limite);
    const hayMas = eventos.length > limite || masEnBase;
    return {
        eventos: await presentarEventos(tx, pagina),
        // Para pedir la página siguiente: ?antes=<siguiente>
        siguiente: hayMas && pagina.length ? pagina[pagina.length - 1].createdAt.toISOString() : null,
    };
}
export const SELECCION_EVENTO = {
    id: true,
    action: true,
    createdAt: true,
    details: true,
    recordingId: true,
    actor: { select: { id: true, name: true } },
    recording: {
        select: {
            id: true,
            type: true,
            title: true,
            status: true,
            bodyText: true,
            parent: { select: { id: true, type: true, title: true } },
        },
    },
};
/** Un evento tal como lo muestra la web (frase, enlace): actividad y bandeja. */
export async function presentarEventos(tx, filas) {
    // Nombres de las personas que aparecen en los detalles (asignados, sumados al proyecto).
    const idsPersonas = new Set();
    for (const e of filas) {
        const d = (e.details ?? {});
        d.userIds?.forEach((id) => idsPersonas.add(id));
        if (d.userId)
            idsPersonas.add(d.userId);
    }
    const personas = idsPersonas.size
        ? await tx.user.findMany({ where: { id: { in: [...idsPersonas] } }, select: { id: true, name: true } })
        : [];
    const nombre = new Map(personas.map((p) => [p.id, p.name]));
    return filas.map((e) => {
        const d = (e.details ?? {});
        const r = e.recording;
        return {
            id: e.id,
            action: e.action,
            createdAt: e.createdAt,
            actor: e.actor,
            elemento: r
                ? {
                    id: r.id,
                    type: r.type,
                    title: r.title,
                    activo: r.status === 'active',
                    extracto: r.type === 'comment' ? (r.bodyText ?? '').slice(0, 140) : null,
                    padre: r.parent ? { id: r.parent.id, type: r.parent.type, title: r.parent.title } : null,
                }
                : null,
            detalles: {
                ...(d.to !== undefined ? { to: d.to } : {}),
                ...(d.from !== undefined ? { from: d.from } : {}),
                ...(d.name ? { name: d.name } : {}),
                ...(d.title ? { title: d.title } : {}),
                personas: [...(d.userIds ?? []), ...(d.userId ? [d.userId] : [])].map((id) => nombre.get(id) ?? 'alguien'),
            },
        };
    });
}
function buscar(tx, where, take) {
    return tx.event.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take, select: SELECCION_EVENTO });
}
