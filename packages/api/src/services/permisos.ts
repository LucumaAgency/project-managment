/**
 * Quién puede hacer qué DENTRO de una cuenta. RLS ya cuida la frontera entre cuentas; aquí
 * se decide por rol, por membresía en el proyecto y por visibilidad para clientes.
 *
 * Regla de la casa: las rutas no deciden permisos sueltos. Cargan el contexto (proyecto,
 * elemento) con `services/proyectos.ts` y `services/elementos.ts` y preguntan a `puede()`.
 *
 * `puede()` es una función pura: recibe todo lo que necesita y no toca la base, así se
 * prueba sola y no hay consultas escondidas.
 */
import { esCliente, veTodosLosProyectos, type Rol } from '@lucuma-pm/shared';
import type { RecordingStatus, RecordingType } from '@prisma/client';
import type { Contexto } from '../lib/contexto.js';
import { HttpError } from '../lib/errores.js';

/** Quién actúa (sale de `exigirCuenta`). Soporte en beta llega con rol admin. */
export interface Actor {
  ctx: Contexto;
  rol: Rol;
}

export interface ProyectoCargado {
  id: string;
  status: 'active' | 'archived' | 'trashed';
  createdById: string;
  /** La persona que actúa está en el proyecto (ProjectMember). */
  esMiembro: boolean;
}

export interface ElementoCargado {
  id: string;
  type: RecordingType;
  creatorId: string;
  status: RecordingStatus;
  /** Él y toda su cadena de padres son visibles para clientes. */
  visibleEnCadena: boolean;
  /** Algún padre está en la papelera (o archivado): el elemento no se ve ni se toca. */
  padreInactivo: boolean;
}

export type Accion =
  | 'proyecto.ver'
  | 'proyecto.crear'
  | 'proyecto.editar'
  | 'proyecto.archivar' // archivar y reactivar
  | 'proyecto.papelera' // mandar a la papelera y restaurar
  | 'proyecto.personas' // agregar y quitar personas del proyecto, invitar clientes
  | 'proyecto.verPapelera'
  | 'elemento.ver'
  | 'elemento.crear'
  | 'elemento.editar'
  | 'elemento.papelera'
  | 'elemento.cambiarVisibilidad';

const gestiona = (rol: Rol) => veTodosLosProyectos(rol); // owner y admin

/** Qué tipos puede crear un cliente. Lo que crea nace visible para clientes. */
export const TIPOS_DE_CLIENTE: RecordingType[] = ['todo', 'message', 'comment'];

export function puede(
  actor: Actor,
  accion: Accion,
  sobre: { proyecto?: ProyectoCargado; elemento?: ElementoCargado; tipo?: RecordingType } = {}
): boolean {
  const { rol } = actor;
  const cliente = esCliente(rol);
  const p = sobre.proyecto;
  const e = sobre.elemento;

  if (accion === 'proyecto.crear') return !cliente;
  if (!p) return false;

  const veProyecto = p.status === 'trashed' ? gestiona(rol) : gestiona(rol) || p.esMiembro;
  if (!veProyecto) return false;
  const esCreadorProyecto = p.createdById === actor.ctx.userId;
  const activo = p.status === 'active';

  switch (accion) {
    case 'proyecto.ver':
      return true;
    case 'proyecto.editar':
      return activo && (gestiona(rol) || (!cliente && p.esMiembro));
    case 'proyecto.archivar':
    case 'proyecto.papelera':
      return gestiona(rol) || (!cliente && esCreadorProyecto);
    case 'proyecto.personas':
      return activo && (gestiona(rol) || (!cliente && p.esMiembro));
    case 'proyecto.verPapelera':
      return gestiona(rol);
  }

  // --- elementos: el proyecto tiene que verse; archivado = solo lectura
  if (accion === 'elemento.crear') {
    if (!activo) return false;
    if (cliente && (!sobre.tipo || !TIPOS_DE_CLIENTE.includes(sobre.tipo))) return false;
    // Crear dentro de un padre: el padre tiene que verse (lo revisa elemento.ver del padre).
    return !e || puede(actor, 'elemento.ver', { proyecto: p, elemento: e });
  }
  if (!e) return false;

  const veElemento = !e.padreInactivo && (!cliente || e.visibleEnCadena);
  if (accion === 'elemento.ver') return veElemento && (e.status === 'active' || gestiona(rol) || e.creatorId === actor.ctx.userId);
  if (!veElemento || !activo) return false;

  const esCreador = e.creatorId === actor.ctx.userId;
  switch (accion) {
    case 'elemento.editar':
      return e.status === 'active' && (gestiona(rol) || esCreador);
    case 'elemento.papelera':
      return gestiona(rol) || esCreador;
    case 'elemento.cambiarVisibilidad':
      return e.status === 'active' && !cliente && e.type !== 'comment';
  }
  return false;
}

/**
 * Corta si no puede. Cuando ni siquiera puede VER, responde 404 y no 403: así no revela que
 * el proyecto o el elemento existen.
 */
export function exigir(actor: Actor, accion: Accion, sobre: Parameters<typeof puede>[2] = {}, mensaje?: string) {
  if (puede(actor, accion, sobre)) return;
  const ve =
    accion === 'proyecto.crear' ||
    (sobre.proyecto && puede(actor, 'proyecto.ver', { proyecto: sobre.proyecto }) &&
      // Para crear, `elemento` es el padre: si no se ve el padre, tampoco se revela.
      (!sobre.elemento || puede(actor, 'elemento.ver', { proyecto: sobre.proyecto, elemento: sobre.elemento })));
  if (!ve) throw new HttpError(404, 'No encontrado.');
  throw new HttpError(403, mensaje ?? 'No tienes permiso para hacer esto.');
}
