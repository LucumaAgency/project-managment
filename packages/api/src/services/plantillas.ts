/**
 * Plantillas de lista (D-64, documentacion/12-PLANTILLAS-Y-FLUJOS.md): el onboarding de un
 * cliente o los pasos de un servicio, escritos una vez. Agregar una plantilla a un proyecto crea
 * una lista con sus tareas usando los mismos servicios que la web (eventos, avisos,
 * suscripciones y permisos incluidos), así que es como si alguien las hubiera creado a mano.
 *
 * Sin roles: cada tarea dice si es del equipo (interna), del cliente (se le asigna y la ve) o
 * de cualquiera (equipo y cliente asignados, visible). Las fechas son "día N" desde el inicio.
 *
 * Quién: el equipo (no clientes) ve las plantillas y las agrega; dueño y admin las crean,
 * editan y borran.
 */
import { esCliente, veTodosLosProyectos } from '@lucuma-pm/shared';
import type { TemplateAudience } from '@prisma/client';
import type { Tx } from '../lib/contexto.js';
import { documentoDesdeTexto } from '../lib/documento.js';
import { HttpError } from '../lib/errores.js';
import { crearElemento, elementoPara } from './elementos.js';
import { mencionables } from './menciones.js';
import { exigir, type Actor } from './permisos.js';
import { proyectoPara } from './proyectos.js';
import { diaEn, sumarDias } from './recordatorios.js';
import { crearTarea } from './tareas.js';

export const MAX_TAREAS_PLANTILLA = 100;
export const MAX_DIA = 365;

export interface TareaPlantilla {
  title: string;
  notes?: string | null;
  audience: TemplateAudience;
  dayOffset?: number | null;
}
export interface DatosPlantilla {
  name: string;
  description?: string | null;
  items: TareaPlantilla[];
}

function exigirEquipo(actor: Actor) {
  if (esCliente(actor.rol)) throw new HttpError(404, 'No encontrado.');
}
function exigirGestion(actor: Actor) {
  exigirEquipo(actor);
  if (!veTodosLosProyectos(actor.rol)) throw new HttpError(403, 'Solo el dueño o un administrador edita las plantillas.');
}

const SELECCION = {
  id: true,
  name: true,
  description: true,
  updatedAt: true,
  items: {
    select: { id: true, title: true, notes: true, audience: true, dayOffset: true, position: true },
    orderBy: { position: 'asc' as const },
  },
};

function resumen(p: { id: string; name: string; description: string | null; updatedAt: Date; items: { audience: TemplateAudience }[] }) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    updatedAt: p.updatedAt,
    tareas: p.items.length,
    delCliente: p.items.filter((i) => i.audience !== 'team').length,
  };
}

export async function listarPlantillas(tx: Tx, actor: Actor) {
  exigirEquipo(actor);
  const filas = await tx.listTemplate.findMany({
    where: { accountId: actor.ctx.accountId },
    select: { id: true, name: true, description: true, updatedAt: true, items: { select: { audience: true } } },
    orderBy: { name: 'asc' },
  });
  return { plantillas: filas.map(resumen), permisos: { gestionar: veTodosLosProyectos(actor.rol) } };
}

async function cargar(tx: Tx, actor: Actor, id: string) {
  const p = await tx.listTemplate.findFirst({ where: { id, accountId: actor.ctx.accountId }, select: SELECCION });
  if (!p) throw new HttpError(404, 'No encontrado.');
  return p;
}

export async function plantillaDetalle(tx: Tx, actor: Actor, id: string) {
  exigirEquipo(actor);
  const p = await cargar(tx, actor, id);
  return {
    plantilla: { ...resumen(p), items: p.items.map(({ position: _, ...i }) => i) },
    permisos: { gestionar: veTodosLosProyectos(actor.rol) },
  };
}

function limpiar(datos: DatosPlantilla) {
  const name = datos.name.trim();
  if (!name) throw new HttpError(400, 'Falta el nombre de la plantilla.');
  const items = datos.items
    .map((i) => ({ ...i, title: i.title.trim(), notes: i.notes?.trim() || null }))
    .filter((i) => i.title);
  if (items.length > MAX_TAREAS_PLANTILLA) throw new HttpError(400, `Una plantilla tiene como máximo ${MAX_TAREAS_PLANTILLA} tareas.`);
  for (const i of items) {
    if (i.dayOffset != null && (!Number.isInteger(i.dayOffset) || i.dayOffset < 1 || i.dayOffset > MAX_DIA)) {
      throw new HttpError(400, `El día va de 1 a ${MAX_DIA} (1 = el día de inicio).`);
    }
  }
  return { name, description: datos.description?.trim() || null, items };
}

/** Crea (id null) o reemplaza una plantilla entera: nombre, descripción y tareas en orden. */
export async function guardarPlantilla(tx: Tx, actor: Actor, id: string | null, datos: DatosPlantilla) {
  exigirGestion(actor);
  const { name, description, items } = limpiar(datos);
  const accountId = actor.ctx.accountId;
  let plantillaId = id;
  if (plantillaId) {
    await cargar(tx, actor, plantillaId);
    await tx.listTemplate.update({ where: { id: plantillaId }, data: { name, description } });
    await tx.listTemplateItem.deleteMany({ where: { templateId: plantillaId } });
  } else {
    plantillaId = (await tx.listTemplate.create({ data: { accountId, name, description, createdById: actor.ctx.userId }, select: { id: true } })).id;
  }
  if (items.length) {
    await tx.listTemplateItem.createMany({
      data: items.map((i, n) => ({
        accountId,
        templateId: plantillaId!,
        title: i.title,
        notes: i.notes,
        audience: i.audience,
        dayOffset: i.dayOffset ?? null,
        position: n + 1,
      })),
    });
  }
  return plantillaDetalle(tx, actor, plantillaId);
}

export async function borrarPlantilla(tx: Tx, actor: Actor, id: string) {
  exigirGestion(actor);
  await cargar(tx, actor, id);
  await tx.listTemplate.delete({ where: { id } });
}

const diferenciaDias = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

/**
 * "Guardar como plantilla" desde una lista que salió bien. Las fechas pasan a "día N" contando
 * desde el día en que se creó la lista; las personas no se guardan, solo para quién es:
 * interna → equipo; visible y solo con clientes responsables → cliente; otra visible → cualquiera.
 */
export async function plantillaDesdeLista(tx: Tx, actor: Actor, listaId: string, nombre?: string) {
  exigirGestion(actor);
  const { elemento } = await elementoPara(tx, actor, listaId, 'elemento.ver');
  if (elemento.type !== 'todolist') throw new HttpError(400, 'Solo una lista de tareas se guarda como plantilla.');
  const lista = await tx.recording.findUniqueOrThrow({ where: { id: listaId }, select: { title: true, bodyText: true, createdAt: true } });
  const tareas = await tx.recording.findMany({
    where: { parentId: listaId, type: 'todo', status: 'active' },
    select: {
      title: true,
      bodyText: true,
      visibleToClients: true,
      todo: { select: { dueOn: true } },
      assignees: { select: { userId: true } },
    },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
  const clientes = new Set(
    (await tx.membership.findMany({ where: { accountId: actor.ctx.accountId, role: 'client' }, select: { userId: true } })).map((m) => m.userId)
  );
  const zona = (await tx.account.findUniqueOrThrow({ where: { id: actor.ctx.accountId }, select: { timeZone: true } })).timeZone;
  const inicio = diaEn(zona, lista.createdAt);
  const items: TareaPlantilla[] = tareas.map((t) => {
    const deCliente = t.assignees.filter((a) => clientes.has(a.userId)).length;
    const audience: TemplateAudience = !(t.visibleToClients && elemento.visibleEnCadena)
      ? 'team'
      : deCliente > 0 && deCliente === t.assignees.length
        ? 'client'
        : 'any';
    const vence = t.todo?.dueOn?.toISOString().slice(0, 10);
    return {
      title: t.title ?? '',
      notes: t.bodyText,
      audience,
      dayOffset: vence ? Math.min(MAX_DIA, Math.max(1, diferenciaDias(inicio, vence) + 1)) : null,
    };
  });
  return guardarPlantilla(tx, actor, null, { name: nombre?.trim() || lista.title || 'Plantilla', description: lista.bodyText, items });
}

export interface DatosAplicar {
  plantillaId: string;
  /** Día 1 de la plantilla. Por defecto, hoy en la zona de la cuenta. */
  inicio?: string;
  /** Nombre de la lista nueva. Por defecto, el de la plantilla. */
  titulo?: string;
  /**
   * Quién del equipo lleva las tareas del equipo. Por defecto, quien agrega la plantilla
   * (un bot no: sin responsable queda sin asignar). null = sin asignar.
   */
  responsableId?: string | null;
  /** Clientes del proyecto que reciben sus tareas. Por defecto, todos los del proyecto. */
  clienteIds?: string[];
}

/** Agrega una plantilla a un proyecto: una lista nueva con sus tareas, fechas y responsables. */
export async function aplicarPlantilla(tx: Tx, actor: Actor, projectId: string, datos: DatosAplicar) {
  exigirEquipo(actor);
  const proyecto = await proyectoPara(tx, actor, projectId, 'proyecto.ver');
  exigir(actor, 'elemento.crear', { proyecto, tipo: 'todolist' }, 'No puedes agregar listas en este proyecto.');
  const plantilla = await cargar(tx, actor, datos.plantillaId);

  const personas = await mencionables(tx, actor.ctx.accountId, projectId, { incluirClientes: true });
  const equipo = personas.filter((p) => p.role !== 'client');
  const clientesDelProyecto = personas.filter((p) => p.role === 'client');

  const yo = await tx.user.findUniqueOrThrow({ where: { id: actor.ctx.userId }, select: { isBot: true } });
  const responsableId = datos.responsableId !== undefined ? datos.responsableId : yo.isBot ? null : actor.ctx.userId;
  if (responsableId && !equipo.some((p) => p.userId === responsableId)) {
    throw new HttpError(400, 'El responsable tiene que ser alguien del equipo que vea el proyecto.');
  }
  const clienteIds = datos.clienteIds ?? clientesDelProyecto.map((p) => p.userId);
  if (clienteIds.some((id) => !clientesDelProyecto.some((p) => p.userId === id))) {
    throw new HttpError(400, 'Solo se asignan tareas a clientes que están en el proyecto.');
  }

  const zona = (await tx.account.findUniqueOrThrow({ where: { id: actor.ctx.accountId }, select: { timeZone: true } })).timeZone;
  const inicio = datos.inicio ?? diaEn(zona);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || Number.isNaN(Date.parse(`${inicio}T00:00:00Z`))) {
    throw new HttpError(400, 'La fecha de inicio va como AAAA-MM-DD.');
  }

  const conCliente = plantilla.items.some((i) => i.audience !== 'team');
  const lista = await crearElemento(tx, actor, projectId, {
    type: 'todolist',
    title: datos.titulo?.trim() || plantilla.name,
    bodyText: plantilla.description ?? undefined,
    visibleToClients: conCliente,
  });

  const equipoIds = responsableId ? [responsableId] : [];
  for (const i of plantilla.items) {
    await crearTarea(tx, actor, lista.id, {
      title: i.title,
      ...(i.notes ? { body: documentoDesdeTexto(i.notes) } : {}),
      visibleToClients: i.audience !== 'team',
      dueOn: i.dayOffset ? sumarDias(inicio, i.dayOffset - 1) : null,
      assigneeIds: i.audience === 'team' ? equipoIds : i.audience === 'client' ? clienteIds : [...equipoIds, ...clienteIds],
    });
  }
  return {
    lista: { id: lista.id, title: lista.title },
    tareas: plantilla.items.length,
    inicio,
    sinCliente: conCliente && clienteIds.length === 0,
  };
}
