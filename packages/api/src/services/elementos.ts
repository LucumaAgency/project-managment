/**
 * Servicio genérico de elementos (Recording): listas, tareas, mensajes, carpetas, archivos y
 * comentarios. Crear, editar, papelera y restaurar se programan UNA vez aquí y sirven para
 * todos los tipos. Cada cambio registra su evento en la misma transacción.
 *
 * Visibilidad para clientes (la regla más delicada del producto):
 *  - Un hijo nunca es más visible que su padre: un cliente ve un elemento solo si él y toda su
 *    cadena de padres son visibles (`visibleEnCadena`).
 *  - Lo que crea un cliente nace visible.
 *  - Un comentario copia la visibilidad de lo que comenta.
 */
import { esCliente } from '@lucuma-pm/shared';
import type { RecordingType } from '@prisma/client';
import type { Tx } from '../lib/contexto.js';
import { HttpError } from '../lib/errores.js';
import { registrarEvento } from './eventos.js';
import { exigir, type Accion, type Actor, type ElementoCargado, type ProyectoCargado } from './permisos.js';
import { proyectoPara } from './proyectos.js';

/** Dentro de qué puede ir cada tipo. `null` = en la raíz del proyecto. */
export const PADRES: Record<RecordingType, (RecordingType | null)[]> = {
  todolist: [null],
  todo: ['todolist'],
  message: [null],
  folder: [null, 'folder'],
  upload: [null, 'folder'],
  comment: ['todolist', 'todo', 'message', 'upload'],
};

/** Los archivos se crean al confirmar una subida (día 10), no por la ruta genérica. */
export const TIPOS_CREABLES = ['todolist', 'todo', 'message', 'folder', 'comment'] as const;
export type TipoCreable = (typeof TIPOS_CREABLES)[number];

const LLEVA_TITULO: RecordingType[] = ['todolist', 'todo', 'message', 'folder', 'upload'];

/** Columnas que se devuelven a la web. */
export const SELECCION = {
  id: true,
  projectId: true,
  type: true,
  parentId: true,
  title: true,
  bodyText: true,
  visibleToClients: true,
  status: true,
  position: true,
  createdAt: true,
  updatedAt: true,
  trashedAt: true,
  creator: { select: { id: true, name: true } },
} as const;

interface Eslabon {
  id: string;
  parentId: string | null;
  visible: boolean;
  status: string;
  projectId: string;
  type: RecordingType;
  creatorId: string;
  nivel: number;
}

/** El elemento y todos sus padres, del elemento hacia la raíz (pasa por RLS). */
async function cadena(tx: Tx, id: string): Promise<Eslabon[]> {
  return tx.$queryRaw<Eslabon[]>`
    WITH RECURSIVE c AS (
      SELECT id, "parentId", "visibleToClients" AS visible, status::text, "projectId", type, "creatorId", 0 AS nivel
      FROM recordings WHERE id = ${id}
      UNION ALL
      SELECT r.id, r."parentId", r."visibleToClients", r.status::text, r."projectId", r.type, r."creatorId", c.nivel + 1
      FROM recordings r JOIN c ON r.id = c."parentId"
      WHERE c.nivel < 50
    )
    SELECT * FROM c ORDER BY nivel`;
}

function aCargado(eslabones: Eslabon[]): ElementoCargado {
  const [e, ...padres] = eslabones;
  return {
    id: e.id,
    type: e.type,
    creatorId: e.creatorId,
    status: e.status as ElementoCargado['status'],
    visibleEnCadena: eslabones.every((x) => x.visible),
    padreInactivo: padres.some((x) => x.status !== 'active'),
  };
}

/**
 * Carga un elemento con su proyecto y corta si la acción no se permite. Lo que no existe y lo
 * que no puedes ver (p. ej. algo interno, si eres cliente) responden igual: 404.
 */
export async function elementoPara(tx: Tx, actor: Actor, id: string, accion: Accion, mensaje?: string) {
  const eslabones = await cadena(tx, id);
  if (eslabones.length === 0) throw new HttpError(404, 'No encontrado.');
  const proyecto = await proyectoPara(tx, actor, eslabones[0].projectId, 'proyecto.ver');
  const elemento = aCargado(eslabones);
  exigir(actor, accion, { proyecto, elemento }, mensaje);
  return { proyecto, elemento };
}

/** Visibilidad efectiva (con la cadena) de un elemento, para copiarla al evento. */
async function visibleEfectivo(tx: Tx, id: string) {
  return (await cadena(tx, id)).every((x) => x.visible);
}

export interface DatosNuevo {
  type: TipoCreable;
  parentId?: string | null;
  title?: string;
  bodyText?: string;
  visibleToClients?: boolean;
}

export async function crearElemento(tx: Tx, actor: Actor, projectId: string, datos: DatosNuevo) {
  const proyecto = await proyectoPara(tx, actor, projectId, 'proyecto.ver');
  const parentId = datos.parentId ?? null;
  let padre: { elemento: ElementoCargado; visible: boolean } | null = null;

  if (parentId) {
    const eslabones = await cadena(tx, parentId);
    if (eslabones.length === 0 || eslabones[0].projectId !== projectId) throw new HttpError(404, 'No encontrado.');
    padre = { elemento: aCargado(eslabones), visible: eslabones.every((x) => x.visible) };
    if (padre.elemento.status !== 'active') throw new HttpError(409, 'Eso está en la papelera.');
  }
  exigir(actor, 'elemento.crear', { proyecto, elemento: padre?.elemento, tipo: datos.type }, 'Tu rol no puede crear esto aquí.');

  const tipoPadre = padre?.elemento.type ?? null;
  if (!PADRES[datos.type].includes(tipoPadre)) {
    throw new HttpError(400, `Un elemento de tipo ${datos.type} no puede ir ${tipoPadre ? `dentro de ${tipoPadre}` : 'en la raíz'}.`);
  }
  const title = datos.title?.trim() || null;
  const bodyText = datos.bodyText?.trim() || null;
  if (LLEVA_TITULO.includes(datos.type) && !title) throw new HttpError(400, 'Falta el título.');
  if (datos.type === 'comment' && !bodyText) throw new HttpError(400, 'El comentario está vacío.');

  // Visibilidad: el cliente crea visible; el comentario copia la de su padre; el resto elige.
  const visibleToClients =
    datos.type === 'comment'
      ? padre!.visible
      : esCliente(actor.rol)
        ? true
        : (datos.visibleToClients ?? false);

  const ultimo = await tx.recording.aggregate({
    where: { projectId, parentId, type: datos.type },
    _max: { position: true },
  });
  const creado = await tx.recording.create({
    data: {
      accountId: actor.ctx.accountId,
      projectId,
      type: datos.type,
      parentId,
      creatorId: actor.ctx.userId,
      title: datos.type === 'comment' ? null : title,
      bodyText,
      visibleToClients,
      position: (ultimo._max.position ?? 0) + 1,
    },
    select: SELECCION,
  });
  await registrarEvento(tx, {
    accountId: actor.ctx.accountId,
    projectId,
    recordingId: creado.id,
    actorId: actor.ctx.userId,
    action: 'created',
    details: { type: creado.type },
    visibleToClients: visibleToClients && (padre?.visible ?? true),
  });
  return creado;
}

export interface DatosEdicion {
  title?: string;
  bodyText?: string | null;
  visibleToClients?: boolean;
  position?: number;
}

export async function editarElemento(tx: Tx, actor: Actor, id: string, datos: DatosEdicion) {
  const { proyecto, elemento } = await elementoPara(tx, actor, id, 'elemento.editar', 'Solo quien lo creó o un administrador puede editarlo.');
  const actual = await tx.recording.findUniqueOrThrow({ where: { id }, select: { title: true, bodyText: true, visibleToClients: true } });

  const cambios: { title?: string; bodyText?: string | null; visibleToClients?: boolean; position?: number } = {};
  if (datos.title !== undefined) {
    if (!LLEVA_TITULO.includes(elemento.type)) throw new HttpError(400, 'Este elemento no lleva título.');
    const t = datos.title.trim();
    if (!t) throw new HttpError(400, 'Falta el título.');
    cambios.title = t;
  }
  if (datos.bodyText !== undefined) {
    const b = datos.bodyText?.trim() || null;
    if (elemento.type === 'comment' && !b) throw new HttpError(400, 'El comentario está vacío.');
    cambios.bodyText = b;
  }
  if (datos.position !== undefined) cambios.position = datos.position;
  if (datos.visibleToClients !== undefined && datos.visibleToClients !== actual.visibleToClients) {
    exigir(actor, 'elemento.cambiarVisibilidad', { proyecto, elemento }, 'No puedes cambiar la visibilidad de esto.');
    cambios.visibleToClients = datos.visibleToClients;
  }
  if (Object.keys(cambios).length === 0) throw new HttpError(400, 'No hay nada que cambiar.');

  const editado = await tx.recording.update({ where: { id }, data: cambios, select: SELECCION });
  const visible = await visibleEfectivo(tx, id);
  const base = { accountId: actor.ctx.accountId, projectId: proyecto.id, recordingId: id, actorId: actor.ctx.userId };
  if (cambios.visibleToClients !== undefined) {
    await registrarEvento(tx, { ...base, action: 'visibility_changed', details: { to: cambios.visibleToClients }, visibleToClients: visible });
  }
  if (cambios.title !== undefined || cambios.bodyText !== undefined) {
    await registrarEvento(tx, {
      ...base,
      action: 'updated',
      details: cambios.title !== undefined && cambios.title !== actual.title ? { title: { from: actual.title, to: cambios.title } } : {},
      visibleToClients: visible,
    });
  }
  return editado;
}

/** A la papelera: deja de verse con todo lo que tiene dentro. Se purga a los 30 días (día 14). */
export async function papeleraElemento(tx: Tx, actor: Actor, id: string) {
  const { proyecto, elemento } = await elementoPara(tx, actor, id, 'elemento.papelera', 'Solo quien lo creó o un administrador puede borrarlo.');
  if (elemento.status === 'trashed') return tx.recording.findUniqueOrThrow({ where: { id }, select: SELECCION });
  const r = await tx.recording.update({
    where: { id },
    data: { status: 'trashed', trashedAt: new Date(), trashedById: actor.ctx.userId },
    select: SELECCION,
  });
  await registrarEvento(tx, {
    accountId: actor.ctx.accountId,
    projectId: proyecto.id,
    recordingId: id,
    actorId: actor.ctx.userId,
    action: 'trashed',
    visibleToClients: await visibleEfectivo(tx, id),
  });
  return r;
}

export async function restaurarElemento(tx: Tx, actor: Actor, id: string) {
  const { proyecto, elemento } = await elementoPara(tx, actor, id, 'elemento.papelera', 'Solo quien lo creó o un administrador puede restaurarlo.');
  if (elemento.status !== 'trashed') throw new HttpError(409, 'No está en la papelera.');
  const r = await tx.recording.update({
    where: { id },
    data: { status: 'active', trashedAt: null, trashedById: null },
    select: SELECCION,
  });
  await registrarEvento(tx, {
    accountId: actor.ctx.accountId,
    projectId: proyecto.id,
    recordingId: id,
    actorId: actor.ctx.userId,
    action: 'restored',
    visibleToClients: await visibleEfectivo(tx, id),
  });
  return r;
}

/**
 * Hijos activos de un padre (o de la raíz del proyecto), en orden. Para un cliente, solo los
 * visibles, y solo si el padre (con su cadena) también lo es.
 */
export async function listarElementos(
  tx: Tx,
  actor: Actor,
  proyecto: ProyectoCargado,
  filtro: { parentId: string | null; type?: RecordingType }
) {
  if (filtro.parentId) {
    const { elemento } = await elementoPara(tx, actor, filtro.parentId, 'elemento.ver');
    if (elemento.status !== 'active') return [];
  }
  return tx.recording.findMany({
    where: {
      projectId: proyecto.id,
      parentId: filtro.parentId,
      status: 'active',
      ...(filtro.type ? { type: filtro.type } : {}),
      ...(esCliente(actor.rol) ? { visibleToClients: true } : {}),
    },
    select: SELECCION,
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
}
