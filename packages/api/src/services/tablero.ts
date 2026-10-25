/**
 * Tablero (D-68): una lista de tareas vista por columnas, tipo Trello. No es otra herramienta:
 * las tarjetas son las mismas tareas (con lo que piden, sus esperas, recordatorios, plantillas
 * y el bot), con una columna más. La última columna es "Hecho": llegar ahí completa la tarea y
 * salir de ahí la reabre. En la columna de revisión, el cliente aprueba o pide cambios.
 *
 * También aquí: los pasos de una tarea (una mini lista dentro de la tarjeta).
 */
import { esCliente } from '@lucuma-pm/shared';
import { Prisma } from '@prisma/client';
import type { Tx } from '../lib/contexto.js';
import { HttpError } from '../lib/errores.js';
import { avisar, seguidoresComo } from './avisos.js';
import { crearElemento, elementoPara } from './elementos.js';
import { registrarEvento } from './eventos.js';
import { exigir, puede, type Actor } from './permisos.js';
import { cambiarCompletada } from './tareas.js';

export type TipoColumna = 'revision' | 'hecho';
export interface Columna {
  id: string;
  nombre: string;
  tipo?: TipoColumna;
}
export const COLUMNAS_INICIALES: Columna[] = [
  { id: 'k1', nombre: 'Sin empezar' },
  { id: 'k2', nombre: 'En proceso' },
  { id: 'k3', nombre: 'En revisión', tipo: 'revision' },
  { id: 'k4', nombre: 'Hecho', tipo: 'hecho' },
];
const MAX_COLUMNAS = 12;

export function leerColumnas(json: unknown): Columna[] {
  if (!Array.isArray(json)) return COLUMNAS_INICIALES;
  const cols = json.filter((c): c is Columna => !!c && typeof c === 'object' && typeof c.id === 'string' && typeof c.nombre === 'string');
  return cols.length ? cols : COLUMNAS_INICIALES;
}

/**
 * Valida las columnas que llegan. La última es siempre "Hecho" (se agrega si falta); a lo más
 * una de revisión. Las que ya existían conservan su id (así sus tarjetas no se mueven).
 */
export function normalizarColumnas(entrada: unknown, existentes: Columna[]): Columna[] {
  if (!Array.isArray(entrada)) throw new HttpError(400, 'Las columnas van como una lista.');
  const conocidos = new Set(existentes.map((c) => c.id));
  let siguiente = Math.max(0, ...existentes.map((c) => Number(/^k(\d+)$/.exec(c.id)?.[1] ?? 0))) + 1;
  const usados = new Set<string>();
  const sinHecho: Columna[] = [];
  let hecho: Columna | null = null;
  let revisiones = 0;
  for (const c of entrada as Record<string, unknown>[]) {
    const nombre = typeof c?.nombre === 'string' ? c.nombre.trim().slice(0, 40) : '';
    if (!nombre) throw new HttpError(400, 'Cada columna necesita un nombre.');
    let id = typeof c.id === 'string' && conocidos.has(c.id) && !usados.has(c.id) ? c.id : '';
    if (!id) id = `k${siguiente++}`;
    usados.add(id);
    if (c.tipo === 'hecho') {
      hecho = { id, nombre, tipo: 'hecho' };
      continue;
    }
    if (c.tipo === 'revision' && ++revisiones > 1) throw new HttpError(400, 'Solo una columna puede ser de revisión del cliente.');
    sinHecho.push({ id, nombre, ...(c.tipo === 'revision' ? { tipo: 'revision' as const } : {}) });
  }
  if (!sinHecho.length) throw new HttpError(400, 'El tablero necesita al menos una columna antes de «Hecho».');
  const final = [...sinHecho, hecho ?? existentes.find((c) => c.tipo === 'hecho') ?? { id: `k${siguiente++}`, nombre: 'Hecho', tipo: 'hecho' as const }];
  if (final.length > MAX_COLUMNAS) throw new HttpError(400, `Un tablero tiene como máximo ${MAX_COLUMNAS} columnas.`);
  return final;
}

/** En qué columna se muestra una tarea: la suya si existe; si no, Hecho o la primera. */
export function columnaDe(columnas: Columna[], columnId: string | null | undefined, completada: boolean) {
  const hecho = columnas.find((c) => c.tipo === 'hecho')!;
  if (completada) return hecho;
  const c = columnas.find((x) => x.id === columnId);
  return c && c.tipo !== 'hecho' ? c : columnas[0];
}

async function tableroDeLista(tx: Tx, listaId: string) {
  const b = await tx.listBoard.findUnique({ where: { recordingId: listaId }, select: { enabled: true, columns: true } });
  return b ? { enabled: b.enabled, columnas: leerColumnas(b.columns) } : null;
}

/** Tableros de varias listas, para el listado de tareas. */
export async function tablerosDe(tx: Tx, listaIds: string[]) {
  const filas = listaIds.length ? await tx.listBoard.findMany({ where: { recordingId: { in: listaIds } }, select: { recordingId: true, enabled: true, columns: true } }) : [];
  return new Map(filas.map((b) => [b.recordingId, { enabled: b.enabled, columnas: leerColumnas(b.columns) }]));
}

/** Al completar o reabrir (por donde sea): la tarjeta va a Hecho, o sale de ahí. */
export async function columnaSegunEstado(tx: Tx, tareaId: string, completada: boolean) {
  const t = await tx.recording.findUnique({ where: { id: tareaId }, select: { parentId: true, todo: { select: { columnId: true } } } });
  if (!t?.parentId) return;
  const b = await tableroDeLista(tx, t.parentId);
  if (!b) return;
  const hecho = b.columnas.find((c) => c.tipo === 'hecho')!;
  if (completada && t.todo?.columnId !== hecho.id) await tx.todoDetail.update({ where: { recordingId: tareaId }, data: { columnId: hecho.id } });
  if (!completada && t.todo?.columnId === hecho.id) await tx.todoDetail.update({ where: { recordingId: tareaId }, data: { columnId: null } });
}

async function exigirEquipoEnLista(tx: Tx, actor: Actor, listaId: string) {
  const { proyecto, elemento } = await elementoPara(tx, actor, listaId, 'elemento.ver');
  if (elemento.type !== 'todolist') throw new HttpError(400, 'Solo una lista de tareas se ve como tablero.');
  if (esCliente(actor.rol)) throw new HttpError(403, 'El tablero lo arma el equipo.');
  exigir(actor, 'elemento.editar', { proyecto, elemento }, 'No puedes cambiar esta lista.');
  return { proyecto, elemento };
}

/** Ver la lista como tablero (o volver a lista). Las columnas se guardan aunque se apague. */
export async function verComoTablero(tx: Tx, actor: Actor, listaId: string, enabled: boolean) {
  await exigirEquipoEnLista(tx, actor, listaId);
  const b = await tx.listBoard.findUnique({ where: { recordingId: listaId }, select: { recordingId: true } });
  if (b) await tx.listBoard.update({ where: { recordingId: listaId }, data: { enabled } });
  else {
    await tx.listBoard.create({ data: { recordingId: listaId, accountId: actor.ctx.accountId, enabled, columns: COLUMNAS_INICIALES as unknown as Prisma.InputJsonValue } });
    // Las tareas que ya estaban completadas arrancan en Hecho; las demás, en la primera.
    const hecho = COLUMNAS_INICIALES.at(-1)!.id;
    await tx.todoDetail.updateMany({ where: { recording: { parentId: listaId }, completedAt: { not: null } }, data: { columnId: hecho } });
  }
  return tableroDeLista(tx, listaId);
}

/** Editar las columnas (nombre, orden, cuál es de revisión). Las tarjetas de una columna que se quita pasan a la primera. */
export async function fijarColumnas(tx: Tx, actor: Actor, listaId: string, entrada: unknown) {
  await exigirEquipoEnLista(tx, actor, listaId);
  const actual = (await tableroDeLista(tx, listaId))?.columnas ?? COLUMNAS_INICIALES;
  const columnas = normalizarColumnas(entrada, actual);
  await tx.listBoard.upsert({
    where: { recordingId: listaId },
    create: { recordingId: listaId, accountId: actor.ctx.accountId, columns: columnas as unknown as Prisma.InputJsonValue },
    update: { columns: columnas as unknown as Prisma.InputJsonValue },
  });
  const quedan = columnas.map((c) => c.id);
  await tx.todoDetail.updateMany({ where: { recording: { parentId: listaId }, columnId: { notIn: quedan } }, data: { columnId: null } });
  return { enabled: true, columnas };
}

async function tareaEnTablero(tx: Tx, actor: Actor, tareaId: string) {
  const { proyecto, elemento } = await elementoPara(tx, actor, tareaId, 'elemento.ver');
  if (elemento.type !== 'todo') throw new HttpError(404, 'No encontrado.');
  const t = await tx.recording.findUniqueOrThrow({ where: { id: tareaId }, select: { parentId: true, todo: { select: { columnId: true, completedAt: true } } } });
  const b = t.parentId ? await tableroDeLista(tx, t.parentId) : null;
  if (!b) throw new HttpError(400, 'Esta tarea no está en un tablero.');
  const actual = columnaDe(b.columnas, t.todo?.columnId, !!t.todo?.completedAt);
  return { proyecto, elemento, columnas: b.columnas, actual };
}

/** Mover una tarjeta a otra columna (el equipo). A Hecho la completa; desde Hecho, la reabre. */
export async function moverAColumna(tx: Tx, actor: Actor, tareaId: string, columnaId: string) {
  const { proyecto, elemento, columnas, actual } = await tareaEnTablero(tx, actor, tareaId);
  exigir(actor, 'elemento.mover', { proyecto, elemento }, 'Las tarjetas las mueve el equipo.');
  const destino = columnas.find((c) => c.id === columnaId);
  if (!destino) throw new HttpError(400, 'Esa columna no existe en este tablero.');
  if (destino.id === actual.id) return;
  const donde = { projectId: proyecto.id, visible: elemento.visibleEnCadena };
  if (destino.tipo === 'hecho') await cambiarCompletada(tx, actor, donde, tareaId, true);
  else {
    if (actual.tipo === 'hecho') await cambiarCompletada(tx, actor, donde, tareaId, false);
    await tx.todoDetail.upsert({ where: { recordingId: tareaId }, create: { recordingId: tareaId, columnId: destino.id }, update: { columnId: destino.id } });
  }
  // Al final de su columna (quien quiera otro lugar lo reordena después).
  const ultimo = await tx.recording.aggregate({ where: { parentId: (await tx.recording.findUniqueOrThrow({ where: { id: tareaId }, select: { parentId: true } })).parentId, type: 'todo' }, _max: { position: true } });
  await tx.recording.update({ where: { id: tareaId }, data: { position: (ultimo._max.position ?? 0) + 1 } });
  const eventId = await registrarEvento(tx, {
    accountId: actor.ctx.accountId,
    projectId: proyecto.id,
    recordingId: tareaId,
    actorId: actor.ctx.userId,
    action: 'column_changed',
    details: { from: actual.nombre, to: destino.nombre },
    visibleToClients: elemento.visibleEnCadena,
  });
  // A revisión: se avisa a quienes siguen la tarjeta (el cliente, si es suya o la sigue).
  if (destino.tipo === 'revision') {
    await avisar(tx, {
      accountId: actor.ctx.accountId,
      eventId,
      recordingId: tareaId,
      actorId: actor.ctx.userId,
      visibleToClients: elemento.visibleEnCadena,
      destinatarios: await seguidoresComo(tx, tareaId),
    });
  }
}

async function enRevision(tx: Tx, actor: Actor, tareaId: string) {
  const r = await tareaEnTablero(tx, actor, tareaId);
  if (r.actual.tipo !== 'revision') throw new HttpError(409, 'Esta tarjeta no está esperando revisión.');
  if (r.elemento.status !== 'active') throw new HttpError(409, 'Esta tarjeta está en la papelera.');
  return r;
}

/** Aprobar en revisión: quien ve la tarjeta (el cliente, sobre todo). Pasa a Hecho. */
export async function aprobar(tx: Tx, actor: Actor, tareaId: string) {
  const { proyecto, elemento } = await enRevision(tx, actor, tareaId);
  if (proyecto.status !== 'active') throw new HttpError(409, 'El proyecto está archivado.');
  await cambiarCompletada(tx, actor, { projectId: proyecto.id, visible: elemento.visibleEnCadena }, tareaId, true, 'approved');
}

/**
 * Pedir cambios en revisión: deja el comentario y la tarjeta vuelve a la columna anterior a la
 * de revisión (o a la primera).
 */
export async function pedirCambios(tx: Tx, actor: Actor, tareaId: string, comentario: string) {
  const { proyecto, elemento, columnas, actual } = await enRevision(tx, actor, tareaId);
  const texto = comentario.trim();
  if (!texto) throw new HttpError(400, 'Cuéntale al equipo qué cambiar.');
  const i = columnas.findIndex((c) => c.id === actual.id);
  const vuelve = i > 0 ? columnas[i - 1] : columnas[0];
  await tx.todoDetail.update({ where: { recordingId: tareaId }, data: { columnId: vuelve.id } });
  await registrarEvento(tx, {
    accountId: actor.ctx.accountId,
    projectId: proyecto.id,
    recordingId: tareaId,
    actorId: actor.ctx.userId,
    action: 'changes_requested',
    details: { to: vuelve.nombre },
    visibleToClients: elemento.visibleEnCadena,
  });
  // El comentario avisa a quienes siguen la tarjeta (un solo aviso, el del comentario).
  await crearElemento(tx, actor, proyecto.id, { type: 'comment', parentId: tareaId, bodyText: `Pidió cambios: ${texto}` });
}

// ------------------------------------------------------------------------------- pasos

export interface Paso {
  id: string;
  texto: string;
  hecho: boolean;
  porId?: string;
  el?: string;
}
const MAX_PASOS = 30;

export function leerPasos(json: unknown): Paso[] {
  return Array.isArray(json) ? json.filter((p): p is Paso => !!p && typeof p === 'object' && typeof p.id === 'string' && typeof p.texto === 'string') : [];
}

/**
 * Guardar los pasos. Cambiar cuáles son (agregar, quitar, renombrar, ordenar) es del equipo;
 * marcarlos lo hace quien puede completar la tarea.
 */
export async function fijarPasos(tx: Tx, actor: Actor, tareaId: string, entrada: { id?: string; texto: string; hecho?: boolean }[]) {
  const { proyecto, elemento } = await elementoPara(tx, actor, tareaId, 'elemento.ver');
  if (elemento.type !== 'todo') throw new HttpError(404, 'No encontrado.');
  if (entrada.length > MAX_PASOS) throw new HttpError(400, `Como máximo ${MAX_PASOS} pasos.`);
  const d = await tx.todoDetail.findUnique({ where: { recordingId: tareaId }, select: { steps: true } });
  const antes = leerPasos(d?.steps);
  const porId = new Map(antes.map((p) => [p.id, p]));
  let siguiente = Math.max(0, ...antes.map((p) => Number(/^p(\d+)$/.exec(p.id)?.[1] ?? 0))) + 1;
  const ahora = new Date().toISOString();
  const pasos: Paso[] = entrada.map((e) => {
    const texto = e.texto.trim().slice(0, 200);
    if (!texto) throw new HttpError(400, 'Cada paso necesita un texto.');
    const previo = e.id ? porId.get(e.id) : undefined;
    const id = previo ? previo.id : `p${siguiente++}`;
    const hecho = !!e.hecho;
    if (previo && previo.hecho === hecho) return { ...previo, texto };
    return { id, texto, hecho, ...(hecho ? { porId: actor.ctx.userId, el: ahora } : {}) };
  });
  const estructura = (xs: Paso[]) => JSON.stringify(xs.map((p) => [p.id, p.texto]));
  if (estructura(pasos) !== estructura(antes)) {
    if (esCliente(actor.rol) || !puede(actor, 'elemento.editar', { proyecto, elemento })) throw new HttpError(403, 'Los pasos los define el equipo.');
  } else {
    const esAsignado = !!(await tx.todoAssignee.findUnique({ where: { recordingId_userId: { recordingId: tareaId, userId: actor.ctx.userId } } }));
    exigir(actor, 'tarea.completar', { proyecto, elemento, esAsignado }, 'Solo el equipo, o quien la tiene asignada, marca los pasos.');
  }
  await tx.todoDetail.upsert({
    where: { recordingId: tareaId },
    create: { recordingId: tareaId, steps: pasos.length ? (pasos as unknown as Prisma.InputJsonValue) : Prisma.DbNull },
    update: { steps: pasos.length ? (pasos as unknown as Prisma.InputJsonValue) : Prisma.DbNull },
  });
}
