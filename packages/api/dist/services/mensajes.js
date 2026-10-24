/**
 * Mensajes: anuncios o temas del proyecto (elemento `message` en la raíz). Crear, editar,
 * papelera y comentarios son genéricos; aquí, el listado con extracto, comentarios y la
 * última actividad, del más reciente al más viejo.
 */
import { esCliente } from '@lucuma-pm/shared';
import { puede } from './permisos.js';
export async function listarMensajes(tx, actor, proyecto) {
    const visibles = esCliente(actor.rol) ? { visibleToClients: true } : {};
    const mensajes = await tx.recording.findMany({
        where: { projectId: proyecto.id, type: 'message', parentId: null, status: 'active', ...visibles },
        select: {
            id: true,
            title: true,
            bodyText: true,
            visibleToClients: true,
            createdAt: true,
            creator: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
    });
    const comentarios = await tx.recording.groupBy({
        by: ['parentId'],
        where: { type: 'comment', status: 'active', parentId: { in: mensajes.map((m) => m.id) }, ...visibles },
        _count: { _all: true },
        _max: { createdAt: true },
    });
    const de = new Map(comentarios.map((c) => [c.parentId, c]));
    return {
        mensajes: mensajes
            .map((m) => {
            const c = de.get(m.id);
            return {
                id: m.id,
                title: m.title,
                extracto: (m.bodyText ?? '').replace(/\s+/g, ' ').slice(0, 220),
                visibleToClients: m.visibleToClients,
                createdAt: m.createdAt,
                creator: m.creator,
                comentarios: c?._count._all ?? 0,
                ultimaActividad: c?._max.createdAt && c._max.createdAt > m.createdAt ? c._max.createdAt : m.createdAt,
            };
        })
            // Arriba lo que tuvo movimiento reciente (un comentario nuevo sube el mensaje).
            .sort((a, b) => b.ultimaActividad.getTime() - a.ultimaActividad.getTime()),
        puedePublicar: puede(actor, 'elemento.crear', { proyecto, tipo: 'message' }),
    };
}
