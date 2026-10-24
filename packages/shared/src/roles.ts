/** Rol de una persona dentro de una cuenta. Mismo orden que el enum AccountRole de Prisma. */
export const ROLES = ['owner', 'admin', 'member', 'client'] as const;
export type Rol = (typeof ROLES)[number];

export const NOMBRE_ROL: Record<Rol, string> = {
  owner: 'Dueño',
  admin: 'Administrador',
  member: 'Equipo',
  client: 'Cliente',
};

/** Owner y admin ven todos los proyectos de la cuenta sin ser miembros. */
export const veTodosLosProyectos = (rol: Rol) => rol === 'owner' || rol === 'admin';

/** El cliente solo ve lo marcado como visible para clientes. */
export const esCliente = (rol: Rol) => rol === 'client';
