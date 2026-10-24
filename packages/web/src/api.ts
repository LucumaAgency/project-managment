import type { Rol, RolAsignable } from '@lucuma-pm/shared';

/**
 * Cliente de la API. En producción la cuenta sale del subdominio (la API la lee del Host).
 * En local, sin dominio base, la web la guarda y la manda en el encabezado X-Cuenta.
 */
const CLAVE_CUENTA = 'pm_cuenta';

export class ErrorApi extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function cuentaLocal(): string | null {
  const deUrl = new URLSearchParams(window.location.search).get('cuenta');
  if (deUrl) {
    try {
      sessionStorage.setItem(CLAVE_CUENTA, deUrl);
    } catch {
      /* sin almacenamiento: se usa la de la URL */
    }
    return deUrl;
  }
  try {
    return sessionStorage.getItem(CLAVE_CUENTA);
  } catch {
    return null;
  }
}

export function olvidarCuentaLocal() {
  try {
    sessionStorage.removeItem(CLAVE_CUENTA);
  } catch {
    /* nada */
  }
}

export async function api<T>(ruta: string, opciones: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opciones.body !== undefined) headers['content-type'] = 'application/json';
  const cuenta = cuentaLocal();
  if (cuenta) headers['x-cuenta'] = cuenta;

  const r = await fetch(`/api/v1${ruta}`, {
    method: opciones.method ?? (opciones.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
    credentials: 'same-origin',
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorApi(r.status, (datos as { error?: string }).error ?? 'Algo salió mal.');
  return datos as T;
}

export interface Config {
  baseDomain: string;
  /** Hay correo saliente. Sin él (MVP) no se ofrece entrar con enlace al correo. */
  correo: boolean;
}
export interface CuentaDeUsuario {
  id: string;
  slug: string;
  name: string;
  role: string;
}
export interface Sesion {
  usuario: { id: string; name: string; email: string; tienePassword: boolean; soporte: boolean };
  cuentas: CuentaDeUsuario[];
}
export interface Yo {
  usuario: { id: string; name: string; email: string };
  cuenta: { id: string; slug: string; name: string; plan: string };
  rol: Rol;
  /** Soporte de Lucuma dentro de una cuenta donde no es miembro (beta). */
  soporte: boolean;
}

export interface Persona {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Rol;
  status: 'active' | 'disabled';
  company: string | null;
  lastLoginAt: string | null;
  esYo: boolean;
}
export interface InvitacionPendiente {
  id: string;
  email: string;
  role: RolAsignable;
  projectId: string | null;
  expiresAt: string;
  createdAt: string;
  invitedById: string;
  vencida: boolean;
}
export interface Personas {
  personas: Persona[];
  invitaciones: InvitacionPendiente[];
  plan: { nombre: string; maxUsuarios: number | null; usuariosEnUso: number };
  permisos: { gestionar: boolean; invitar: RolAsignable[] };
}
export interface InvitacionCreada {
  invitacion: { id: string; email: string; role: RolAsignable; expiresAt: string };
  enlace: string;
}
export interface InvitacionVista {
  estado: 'vigente' | 'usada' | 'vencida' | 'cerrada';
  cuenta: { slug: string; name: string };
  email: string;
  role: RolAsignable;
  proyecto: string | null;
  invitadoPor: string | null;
  expiresAt: string;
  existeUsuario: boolean;
  sesion: { email: string; esLaInvitada: boolean } | null;
}

export type EstadoProyecto = 'active' | 'archived' | 'trashed';
export interface ProyectoResumen {
  id: string;
  name: string;
  description: string | null;
  status: EstadoProyecto;
  updatedAt: string;
  archivedAt: string | null;
  trashedAt: string | null;
  personas: number;
  soyMiembro: boolean;
}
export interface PersonaProyecto {
  userId: string;
  name: string;
  email: string | null;
  role: Rol;
  company: string | null;
}
export interface ProyectoDetalle {
  proyecto: {
    id: string;
    name: string;
    description: string | null;
    status: EstadoProyecto;
    createdAt: string;
    archivedAt: string | null;
    trashedAt: string | null;
    soyMiembro: boolean;
  };
  personas: PersonaProyecto[];
  secciones: { tareas: number; mensajes: number; archivos: number };
  permisos: { editar: boolean; archivar: boolean; papelera: boolean; personas: boolean; verPapelera: boolean };
}

export interface Tarea {
  id: string;
  listaId: string;
  title: string;
  bodyHtml: string | null;
  tieneNotas: boolean;
  body?: unknown;
  visibleToClients: boolean;
  position: number;
  createdAt: string;
  creator: { id: string; name: string };
  dueOn: string | null;
  completedAt: string | null;
  completedBy: { id: string; name: string } | null;
  assignees: { userId: string; name: string }[];
}
export interface ListaTareas {
  id: string;
  title: string;
  bodyHtml: string | null;
  body: unknown;
  visibleToClients: boolean;
  position: number;
  permisos: { editar: boolean; papelera: boolean; agregar: boolean; mover: boolean };
  tareas: Tarea[];
}
export interface TareasProyecto {
  listas: ListaTareas[];
  permisos: { crearLista: boolean; completarCualquiera: boolean; asignar: boolean };
}
export interface TareaDetalle {
  tarea: Tarea;
  permisos: { editar: boolean; completar: boolean; asignar: boolean; papelera: boolean; cambiarVisibilidad: boolean; mover: boolean };
}
