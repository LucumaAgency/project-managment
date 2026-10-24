/** Rol de una persona dentro de una cuenta. Mismo orden que el enum AccountRole de Prisma. */
export declare const ROLES: readonly ["owner", "admin", "member", "client"];
export type Rol = (typeof ROLES)[number];
export declare const NOMBRE_ROL: Record<Rol, string>;
/** Owner y admin ven todos los proyectos de la cuenta sin ser miembros. */
export declare const veTodosLosProyectos: (rol: Rol) => rol is "admin" | "owner";
/** El cliente solo ve lo marcado como visible para clientes. */
export declare const esCliente: (rol: Rol) => rol is "client";
/** Roles que se pueden dar por invitación o al cambiar el rol. Dueño no: se transfiere aparte. */
export declare const ROLES_ASIGNABLES: readonly ["admin", "member", "client"];
export type RolAsignable = (typeof ROLES_ASIGNABLES)[number];
/** Owner y admin gestionan personas: invitar equipo, cambiar roles, desactivar. */
export declare const gestionaPersonas: (rol: Rol) => rol is "admin" | "owner";
/**
 * Quién puede invitar a quién. Owner y admin invitan a cualquiera (menos dueño); el equipo
 * solo invita clientes, y siempre a un proyecto donde está (eso lo valida la API).
 */
export declare function puedeInvitar(quien: Rol, invitado: RolAsignable): boolean;
/** Cuenta para el límite de usuarios del plan: los clientes invitados no cuentan. */
export declare const cuentaParaLimite: (rol: Rol) => rol is "admin" | "owner" | "member";
