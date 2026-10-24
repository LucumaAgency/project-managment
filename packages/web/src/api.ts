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
  /** Solo para el equipo: qué ve el cliente en la raíz del proyecto. */
  vistaCliente: { listas: number; mensajes: number; carpetas: number; archivos: number } | null;
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
  /** Solo en el listado de tareas. */
  comentarios?: number;
}
export interface ListaTareas {
  id: string;
  title: string;
  bodyHtml: string | null;
  body: unknown;
  visibleToClients: boolean;
  position: number;
  permisos: { editar: boolean; papelera: boolean; agregar: boolean; mover: boolean; visibilidad: boolean };
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

export interface MensajeResumen {
  id: string;
  title: string;
  extracto: string;
  visibleToClients: boolean;
  createdAt: string;
  creator: { id: string; name: string };
  comentarios: number;
  ultimaActividad: string;
}
export interface Elemento {
  id: string;
  projectId: string;
  type: string;
  parentId: string | null;
  title: string | null;
  bodyHtml: string | null;
  body: unknown;
  visibleToClients: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  creator: { id: string; name: string };
}
export interface ElementoConPermisos {
  elemento: Elemento;
  permisos: { editar: boolean; papelera: boolean; cambiarVisibilidad: boolean };
}
export interface Evento {
  id: string;
  action: string;
  createdAt: string;
  actor: { id: string; name: string };
  elemento: {
    id: string;
    type: string;
    title: string | null;
    activo: boolean;
    extracto: string | null;
    padre: { id: string; type: string; title: string | null } | null;
  } | null;
  detalles: { to?: unknown; from?: unknown; name?: unknown; title?: unknown; personas: string[] };
}

export interface VersionArchivo {
  version: number;
  nota: string | null;
  createdAt: string;
  uploadedBy: { id: string; name: string };
  blobId: string;
  filename: string;
  contentType: string;
  bytes: number;
  enLinea: boolean;
}
export interface ListadoArchivos {
  ruta: { id: string; title: string }[];
  carpeta: { id: string; visibleParaCliente: boolean; visibleToClients: boolean; cambiarVisibilidad: boolean } | null;
  carpetas: { id: string; title: string; visibleToClients: boolean; elementos: number }[];
  archivos: { id: string; title: string; visibleToClients: boolean; updatedAt: string; versiones: number; comentarios: number; actual: VersionArchivo }[];
  permisos: { subir: boolean; crearCarpeta: boolean };
  almacenamiento: { usados: number | null; maximo: number | null; maxArchivo: number };
}
export interface DetalleArchivo {
  archivo: { id: string; title: string; carpetaId: string | null; visibleToClients: boolean; visibleParaCliente: boolean; createdAt: string; creator: { id: string; name: string }; versiones: VersionArchivo[] };
  permisos: { nuevaVersion: boolean; renombrar: boolean; papelera: boolean; cambiarVisibilidad: boolean; mover: boolean };
}

/**
 * Dirección de un archivo para <img>, <iframe> o un enlace. Esas peticiones no llevan el
 * encabezado X-Cuenta, así que sin subdominios la cuenta va en ?cuenta= (la API la acepta igual).
 */
export function urlArchivo(blobId: string, descargar = false) {
  const q = new URLSearchParams();
  const cuenta = cuentaLocal();
  if (cuenta) q.set('cuenta', cuenta);
  if (descargar) q.set('descargar', '1');
  const s = q.toString();
  return `/api/v1/blobs/${blobId}/contenido${s ? `?${s}` : ''}`;
}

/** Sube un archivo como cuerpo binario, con avance (fetch no informa el avance de subida). */
export function subirBinario<T>(ruta: string, archivo: File, alAvanzar?: (fraccion: number) => void): Promise<T> {
  return new Promise((ok, mal) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/v1${ruta}`);
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    const cuenta = cuentaLocal();
    if (cuenta) xhr.setRequestHeader('x-cuenta', cuenta);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && alAvanzar?.(e.loaded / e.total);
    xhr.onload = () => {
      let datos: unknown = {};
      try {
        datos = JSON.parse(xhr.responseText);
      } catch {
        /* respuesta sin JSON (p. ej. 413 de nginx) */
      }
      if (xhr.status >= 200 && xhr.status < 300) return ok(datos as T);
      const msj = (datos as { error?: string }).error ?? (xhr.status === 413 ? 'El archivo es demasiado grande para el servidor.' : 'No se pudo subir.');
      mal(new ErrorApi(xhr.status, msj));
    };
    xhr.onerror = () => mal(new ErrorApi(0, 'Se cortó la conexión mientras subía.'));
    xhr.send(archivo);
  });
}

export function tamano(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1).replace('.0', '')} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1).replace('.0', '')} GB`;
}

export interface Aviso {
  id: string;
  reason: 'mentioned' | 'assigned' | 'subscribed' | 'due_soon';
  leido: boolean;
  createdAt: string;
  abre: string | null;
  proyecto: { id: string; name: string };
  /** null en los recordatorios (no salen de un evento). */
  evento: Evento | null;
  recordatorio: { tarea: string; dueOn: string | null; tipo: 'manana' | 'vencida'; completada: boolean } | null;
}
