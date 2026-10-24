/** Rol de una persona dentro de una cuenta. Mismo orden que el enum AccountRole de Prisma. */
export const ROLES = ['owner', 'admin', 'member', 'client'];
export const NOMBRE_ROL = {
    owner: 'Dueño',
    admin: 'Administrador',
    member: 'Equipo',
    client: 'Cliente',
};
/** Owner y admin ven todos los proyectos de la cuenta sin ser miembros. */
export const veTodosLosProyectos = (rol) => rol === 'owner' || rol === 'admin';
/** El cliente solo ve lo marcado como visible para clientes. */
export const esCliente = (rol) => rol === 'client';
/** Roles que se pueden dar por invitación o al cambiar el rol. Dueño no: se transfiere aparte. */
export const ROLES_ASIGNABLES = ['admin', 'member', 'client'];
/** Owner y admin gestionan personas: invitar equipo, cambiar roles, desactivar. */
export const gestionaPersonas = (rol) => rol === 'owner' || rol === 'admin';
/**
 * Quién puede invitar a quién. Owner y admin invitan a cualquiera (menos dueño); el equipo
 * solo invita clientes, y siempre a un proyecto donde está (eso lo valida la API).
 */
export function puedeInvitar(quien, invitado) {
    if (gestionaPersonas(quien))
        return true;
    return quien === 'member' && invitado === 'client';
}
/** Cuenta para el límite de usuarios del plan: los clientes invitados no cuentan. */
export const cuentaParaLimite = (rol) => rol !== 'client';
