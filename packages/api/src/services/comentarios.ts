/**
 * Comentarios: un elemento `comment` colgado de lo que se comenta (lista, tarea, mensaje,
 * archivo). Copia la visibilidad de su padre (services/elementos.ts). Crear, editar y borrar
 * son las operaciones genéricas; aquí, listar con lo que cada uno puede hacer y seguir.
 */
import type { Tx } from '../lib/contexto.js';
import { HttpError } from '../lib/errores.js';
import { crearElemento, elementoPara, listarElementos, PADRES } from './elementos.js';
import { puede, type Actor, type ElementoCargado } from './permisos.js';
import { desuscribir, suscribir, suscriptores } from './suscripciones.js';

/** Un comentario cuenta como editado si se cambió más de un minuto después de escribirlo. */
const EDITADO_MS = 60_000;

export async function listarComentarios(tx: Tx, actor: Actor, elementoId: string) {
  const { proyecto, elemento } = await elementoPara(tx, actor, elementoId, 'elemento.ver');
  const filas = await listarElementos(tx, actor, proyecto, { parentId: elementoId, type: 'comment' });
  const comentarios = filas.map((c) => {
    const cargado: ElementoCargado = {
      id: c.id,
      type: 'comment',
      creatorId: c.creator.id,
      status: 'active',
      visibleEnCadena: elemento.visibleEnCadena,
      padreInactivo: elemento.status !== 'active',
    };
    return {
      id: c.id,
      bodyHtml: c.bodyHtml,
      body: c.creator.id === actor.ctx.userId ? c.body : undefined, // para editar, solo el propio
      creator: c.creator,
      createdAt: c.createdAt,
      editado: c.updatedAt.getTime() - c.createdAt.getTime() > EDITADO_MS,
      permisos: {
        editar: puede(actor, 'elemento.editar', { proyecto, elemento: cargado }),
        papelera: puede(actor, 'elemento.papelera', { proyecto, elemento: cargado }),
      },
    };
  });
  const seguidores = await suscriptores(tx, elementoId);
  return {
    comentarios,
    puedeComentar: PADRES.comment.includes(elemento.type) && puede(actor, 'elemento.crear', { proyecto, elemento, tipo: 'comment' }),
    siguiendo: seguidores.some((s) => s.userId === actor.ctx.userId),
    seguidores,
  };
}

export async function comentar(tx: Tx, actor: Actor, elementoId: string, body: unknown) {
  const { proyecto } = await elementoPara(tx, actor, elementoId, 'elemento.ver');
  return crearElemento(tx, actor, proyecto.id, { type: 'comment', parentId: elementoId, body });
}

export async function seguir(tx: Tx, actor: Actor, elementoId: string, si: boolean) {
  const { elemento } = await elementoPara(tx, actor, elementoId, 'elemento.ver');
  if (elemento.status !== 'active') throw new HttpError(409, 'Eso está en la papelera.');
  if (elemento.type === 'comment') throw new HttpError(400, 'Se sigue lo comentado, no el comentario.');
  if (si) await suscribir(tx, { accountId: actor.ctx.accountId, recordingId: elementoId, userIds: [actor.ctx.userId] });
  else await desuscribir(tx, { recordingId: elementoId, userId: actor.ctx.userId });
  const seguidores = await suscriptores(tx, elementoId);
  return { siguiendo: si, seguidores };
}
