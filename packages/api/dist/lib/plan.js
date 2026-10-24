import { planDe, planPermite } from '@lucuma-pm/shared';
import { HttpError } from './errores.js';
/** Plan efectivo de la cuenta fijada en `tx` (catálogo + excepciones de Account.limits). */
export async function planDeCuenta(tx, accountId) {
    const a = await tx.account.findUniqueOrThrow({ where: { id: accountId }, select: { plan: true, limits: true } });
    return planDe(a.plan, a.limits);
}
/**
 * Personas que cuentan para el límite de usuarios: equipo activo (no clientes). Con
 * `conPendientes`, suma las invitaciones de equipo vigentes, para que no se pueda pasar el
 * límite invitando de más y esperando a que acepten. `salvoEmail` excluye la invitación que
 * se está reemplazando.
 */
export async function usuariosEnUso(tx, accountId, opciones = {}) {
    const activos = await tx.membership.count({
        where: { accountId, status: 'active', role: { not: 'client' } },
    });
    if (!opciones.conPendientes)
        return activos;
    const pendientes = await tx.invitation.count({
        where: {
            accountId,
            role: { not: 'client' },
            acceptedAt: null,
            expiresAt: { gt: new Date() },
            ...(opciones.salvoEmail ? { email: { not: opciones.salvoEmail } } : {}),
        },
    });
    return activos + pendientes;
}
/** Corta con 403 y el motivo del plan si sumar `nuevos` personas de equipo pasa el límite. */
export async function exigirCupoUsuarios(tx, accountId, opciones = {}) {
    const plan = await planDeCuenta(tx, accountId);
    if (plan.maxUsuarios === null)
        return;
    const r = planPermite(plan, { recurso: 'usuarios', actuales: await usuariosEnUso(tx, accountId, opciones) });
    if (!r.ok)
        throw new HttpError(403, r.motivo);
}
