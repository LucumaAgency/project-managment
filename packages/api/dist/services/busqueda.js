/**
 * Búsqueda (día 14, D-57): tareas, listas, mensajes, comentarios, carpetas, archivos y nombres
 * de proyecto, en los proyectos que la persona puede ver.
 *
 * Reglas:
 *   - Solo proyectos activos o archivados donde la persona entra (owner/admin: todos).
 *   - Nada que esté en la papelera, ni lo que tenga un padre en la papelera.
 *   - El cliente solo encuentra lo que ve: la cadena entera tiene que ser visible (igual que
 *     visiblesParaCliente). Se filtra en la base ANTES de cortar a N resultados, así un
 *     montón de coincidencias internas no "esconde" las visibles.
 */
import { esCliente, veTodosLosProyectos } from '@lucuma-pm/shared';
import { consultaTs, fragmento, marcar, sinTildes, terminos } from '../lib/busqueda.js';
export async function buscar(tx, actor, q, opciones = {}) {
    const ts = terminos(q);
    const vacio = { terminos: ts, proyectos: [], resultados: [] };
    if (!ts.length || ts.every((t) => t.length < 2))
        return vacio;
    const cliente = esCliente(actor.rol);
    const limite = Math.min(opciones.limite ?? 30, 50);
    const proyectos = await tx.project.findMany({
        where: {
            accountId: actor.ctx.accountId,
            status: { in: ['active', 'archived'] },
            ...(veTodosLosProyectos(actor.rol) ? {} : { members: { some: { userId: actor.ctx.userId } } }),
            ...(opciones.proyectoId ? { id: opciones.proyectoId } : {}),
        },
        select: { id: true, name: true, status: true },
    });
    if (!proyectos.length)
        return vacio;
    const porId = new Map(proyectos.map((p) => [p.id, p]));
    const ids = proyectos.map((p) => p.id);
    const filas = await tx.$queryRaw `
    WITH RECURSIVE
      candidatos AS (
        SELECT r.id, r.type::text AS type, r.title, r."bodyText", r."projectId", r."parentId", r."creatorId", r."updatedAt",
               ts_rank(r.search, to_tsquery('simple', ${consultaTs(ts)})) AS rango
        FROM recordings r
        WHERE r."projectId" = ANY(${ids})
          AND r.status = 'active'
          AND r.search @@ to_tsquery('simple', ${consultaTs(ts)})
        ORDER BY rango DESC, r."updatedAt" DESC
        LIMIT 400
      ),
      cadena AS (
        SELECT c.id AS raiz, c."parentId", 0 AS nivel, TRUE AS ok
        FROM candidatos c
        UNION ALL
        SELECT k.raiz, r."parentId", k.nivel + 1,
               r.status = 'active' AND (${!cliente} OR r."visibleToClients")
        FROM recordings r JOIN cadena k ON r.id = k."parentId"
        WHERE k.nivel < 50
      ),
      validos AS (SELECT raiz FROM cadena GROUP BY raiz HAVING bool_and(ok))
    SELECT c.id, c.type, c.title, c."bodyText", c."projectId", c."parentId", c."creatorId", c."updatedAt"
    FROM candidatos c
    JOIN validos v ON v.raiz = c.id
    JOIN recordings yo ON yo.id = c.id
    WHERE ${!cliente} OR yo."visibleToClients"
    ORDER BY c.rango DESC, c."updatedAt" DESC
    LIMIT ${limite}`;
    // Lo comentado (para el título y a dónde abre), las tareas completadas y los autores.
    const padres = [...new Set(filas.filter((f) => f.type === 'comment' && f.parentId).map((f) => f.parentId))];
    const tareas = filas.filter((f) => f.type === 'todo').map((f) => f.id);
    const [infoPadres, completadas, autores] = await Promise.all([
        padres.length ? tx.recording.findMany({ where: { id: { in: padres } }, select: { id: true, type: true, title: true } }) : [],
        tareas.length ? tx.todoDetail.findMany({ where: { recordingId: { in: tareas }, completedAt: { not: null } }, select: { recordingId: true } }) : [],
        tx.user.findMany({ where: { id: { in: [...new Set(filas.map((f) => f.creatorId))] } }, select: { id: true, name: true } }),
    ]);
    const padre = new Map(infoPadres.map((p) => [p.id, p]));
    const hecha = new Set(completadas.map((c) => c.recordingId));
    const autor = new Map(autores.map((a) => [a.id, a]));
    const resultados = filas.map((f) => {
        const p = porId.get(f.projectId);
        const comentado = f.type === 'comment' && f.parentId ? padre.get(f.parentId) : undefined;
        const titulo = f.type === 'comment' ? `Comentario en «${comentado?.title ?? 'sin título'}»` : (f.title ?? 'Sin título');
        return {
            id: f.id,
            type: f.type,
            titulo: { texto: titulo, marcas: f.type === 'comment' ? [] : marcar(titulo, ts) },
            fragmento: f.bodyText ? fragmento(f.bodyText, ts) : null,
            proyecto: { id: p.id, name: p.name, archivado: p.status === 'archived' },
            abre: comentado ? { id: comentado.id, type: comentado.type } : { id: f.id, type: f.type },
            ...(f.type === 'todo' ? { completada: hecha.has(f.id) } : {}),
            autor: autor.get(f.creatorId) ?? { id: f.creatorId, name: '—' },
            updatedAt: f.updatedAt,
        };
    });
    // Proyectos por nombre (pocos por cuenta: se filtra en memoria con la misma normalización).
    const proyectosEncontrados = opciones.proyectoId
        ? []
        : proyectos
            .filter((p) => ts.every((t) => sinTildes(p.name).match(/[\p{L}\p{N}]+/gu)?.some((w) => w.startsWith(t))))
            .slice(0, 8)
            .map((p) => ({ id: p.id, name: p.name, archivado: p.status === 'archived', marcas: marcar(p.name, ts) }));
    return { terminos: ts, proyectos: proyectosEncontrados, resultados };
}
