import { planPermite } from '@lucuma-pm/shared';
import { HttpError } from '../lib/errores.js';
import { planDeCuenta } from '../lib/plan.js';
import { exigir } from './permisos.js';
/**
 * Carga un proyecto de la cuenta con lo que `puede()` necesita y corta si la acción no se
 * permite. Un proyecto que no existe y uno que no puedes ver responden igual (404).
 */
export async function proyectoPara(tx, actor, projectId, accion, mensaje) {
    const p = await tx.project.findFirst({
        where: { id: projectId, accountId: actor.ctx.accountId },
        select: {
            id: true,
            name: true,
            description: true,
            status: true,
            createdById: true,
            createdAt: true,
            archivedAt: true,
            trashedAt: true,
            members: { where: { userId: actor.ctx.userId }, select: { id: true } },
        },
    });
    if (!p)
        throw new HttpError(404, 'No encontrado.');
    const { members, ...resto } = p;
    const cargado = { ...resto, esMiembro: members.length > 0 };
    exigir(actor, accion, { proyecto: cargado }, mensaje);
    return cargado;
}
/** Corta con el motivo del plan si sumar un proyecto activo pasa el límite. */
export async function exigirCupoProyectos(tx, accountId) {
    const plan = await planDeCuenta(tx, accountId);
    if (plan.maxProyectos === null)
        return;
    const activos = await tx.project.count({ where: { accountId, status: 'active' } });
    const r = planPermite(plan, { recurso: 'proyectos', actuales: activos });
    if (!r.ok)
        throw new HttpError(403, r.motivo);
}
