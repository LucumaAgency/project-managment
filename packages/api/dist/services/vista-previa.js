/**
 * Vista previa de cada sección en la página del proyecto (como en Basecamp): unas tareas
 * pendientes, los últimos mensajes, las carpetas con sus primeros elementos (D-79) y los últimos archivos. Lo mismo que ve cada quien en la
 * sección: el cliente, solo lo visible con toda su cadena.
 */
import { esCliente } from '@lucuma-pm/shared';
import { Prisma } from '@prisma/client';
import { aDia } from './tareas.js';
const LISTAS = 2;
const TAREAS_POR_LISTA = 3;
const MENSAJES = 3;
const ARCHIVOS = 4;
const CARPETAS = 3;
const POR_CARPETA = 3;
const SUELTOS = 3;
/** De estos ids, los que están activos con toda su cadena (y, para un cliente, visibles). */
async function vivos(tx, ids, cliente) {
    if (!ids.length)
        return new Set();
    const filas = await tx.$queryRaw `
    WITH RECURSIVE c AS (
      SELECT id AS raiz, id, "parentId", "visibleToClients" AS visible, status::text AS status, 0 AS nivel
      FROM recordings WHERE id = ANY(${ids})
      UNION ALL
      SELECT c.raiz, r.id, r."parentId", r."visibleToClients", r.status::text, c.nivel + 1
      FROM recordings r JOIN c ON r.id = c."parentId"
      WHERE c.nivel < 50
    )
    SELECT raiz, bool_and(status = 'active' AND (${!cliente} OR visible)) AS ok FROM c GROUP BY raiz`;
    return new Set(filas.filter((f) => f.ok).map((f) => f.raiz));
}
export async function vistaPrevia(tx, actor, proyecto) {
    const cliente = esCliente(actor.rol);
    const visible = cliente ? { visibleToClients: true } : {};
    const projectId = proyecto.id;
    // Tareas: las primeras listas con sus primeras tareas pendientes.
    const listas = await tx.recording.findMany({
        where: { projectId, type: 'todolist', parentId: null, status: 'active', ...visible },
        select: { id: true, title: true },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        take: LISTAS,
    });
    const enLista = (listaId) => ({ projectId, type: 'todo', status: 'active', parentId: listaId, ...visible });
    const tareas = await Promise.all(listas.map(async (l) => {
        const [total, hechas, abiertas] = await Promise.all([
            tx.recording.count({ where: enLista(l.id) }),
            tx.recording.count({ where: { ...enLista(l.id), todo: { completedAt: { not: null } } } }),
            tx.recording.findMany({
                where: { ...enLista(l.id), OR: [{ todo: null }, { todo: { completedAt: null } }] },
                select: { id: true, title: true, todo: { select: { dueOn: true } } },
                orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
                take: TAREAS_POR_LISTA,
            }),
        ]);
        return { id: l.id, title: l.title, total, hechas, tareas: abiertas.map((t) => ({ id: t.id, title: t.title, dueOn: aDia(t.todo?.dueOn) })) };
    }));
    const pendientes = await tx.recording.count({
        where: {
            projectId,
            type: 'todo',
            status: 'active',
            parent: { status: 'active', ...visible },
            OR: [{ todo: null }, { todo: { completedAt: null } }],
            ...visible,
        },
    });
    // Mensajes: los últimos.
    const mensajes = (await tx.recording.findMany({
        where: { projectId, type: 'message', parentId: null, status: 'active', ...visible },
        select: { id: true, title: true, bodyText: true, createdAt: true, creator: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: MENSAJES,
    })).map((m) => ({ id: m.id, title: m.title, autor: m.creator.name, createdAt: m.createdAt, extracto: (m.bodyText ?? '').replace(/\s+/g, ' ').trim().slice(0, 90) }));
    // Archivos: los últimos subidos en cualquier carpeta que se pueda ver.
    const candidatos = await tx.recording.findMany({
        where: { projectId, type: 'upload', status: 'active', ...visible },
        select: {
            id: true,
            title: true,
            versions: { select: { blob: { select: { id: true, contentType: true } } }, orderBy: { version: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
    });
    const ok = await vivos(tx, candidatos.map((c) => c.id), cliente);
    const archivos = candidatos
        .filter((c) => ok.has(c.id))
        .slice(0, ARCHIVOS)
        .map((c) => ({ id: c.id, title: c.title, blobId: c.versions[0]?.blob.id ?? null, tipo: c.versions[0]?.blob.contentType ?? null }));
    // Carpetas de la raíz con sus primeros elementos, como las listas de Tareas (D-79). Un nivel:
    // la cadena es el elemento y su carpeta, así que basta con pedir los dos activos y visibles.
    const EN_ARCHIVOS = ['folder', 'upload', 'link', 'doc'];
    const tipoPrevia = (t) => (t === 'folder' ? 'carpeta' : t === 'link' ? 'enlace' : t === 'doc' ? 'documento' : 'archivo');
    const raiz = { projectId, parentId: null, type: 'folder', status: 'active', ...visible };
    const [totalCarpetas, raices] = await Promise.all([
        tx.recording.count({ where: raiz }),
        tx.recording.findMany({ where: raiz, select: { id: true, title: true }, orderBy: [{ title: 'asc' }, { createdAt: 'asc' }], take: CARPETAS }),
    ]);
    const carpetas = await Promise.all(raices.map(async (c) => {
        const dentro = { projectId, parentId: c.id, type: { in: [...EN_ARCHIVOS] }, status: 'active', ...visible };
        const [total, hijos] = await Promise.all([
            tx.recording.count({ where: dentro }),
            tx.recording.findMany({ where: dentro, select: { id: true, title: true, type: true }, orderBy: [{ type: 'asc' }, { updatedAt: 'desc' }], take: POR_CARPETA }),
        ]);
        return { id: c.id, title: c.title, total, elementos: hijos.map((h) => ({ id: h.id, title: h.title, tipo: tipoPrevia(h.type) })) };
    }));
    const enRaiz = { projectId, parentId: null, type: { in: ['upload', 'link', 'doc'] }, status: 'active', ...visible };
    const [totalSueltos, sueltos] = await Promise.all([
        tx.recording.count({ where: enRaiz }),
        tx.recording.findMany({ where: enRaiz, select: { id: true, title: true, type: true }, orderBy: { updatedAt: 'desc' }, take: SUELTOS }),
    ]);
    // Ficha del cliente: cuánto va respondido (de lo que cada uno ve).
    const conCampos = await tx.recording.findMany({
        where: { projectId, type: 'todo', status: 'active', parent: { status: 'active', ...visible }, todo: { fields: { not: Prisma.DbNull } }, ...visible },
        select: { id: true, todo: { select: { fields: true } } },
    });
    const total = conCampos.reduce((n, t) => n + (Array.isArray(t.todo?.fields) ? t.todo.fields.length : 0), 0);
    const respondidos = conCampos.length ? await tx.taskAnswer.count({ where: { recordingId: { in: conCampos.map((t) => t.id) } } }) : 0;
    return {
        tareas: { pendientes, listas: tareas },
        mensajes,
        archivos,
        carpetas: { total: totalCarpetas, lista: carpetas, sueltos: { total: totalSueltos, elementos: sueltos.map((s) => ({ id: s.id, title: s.title, tipo: tipoPrevia(s.type) })) } },
        ficha: { respondidos, total },
    };
}
