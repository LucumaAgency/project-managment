import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { conCuenta } from '../lib/contexto.js';
import { leer } from '../lib/validar.js';
import { crearElemento } from '../services/elementos.js';
import { proyectoPara } from '../services/proyectos.js';
import { activarAhora, completarPorRespuestas, completarTarea, crearTarea, editarTarea, listarTareas, tareaDetalle } from '../services/tareas.js';
import { MAX_CAMPOS, fichaProyecto, responder, verAcceso } from '../services/campos.js';
import { timeline } from '../services/timeline.js';
import { aprobar, fijarColumnas, fijarPasos, moverAColumna, pedirCambios, verComoTablero } from '../services/tablero.js';
import { exigirCuenta } from '../plugins/contexto.js';

const titulo = z.string().max(300, 'Máximo 300 caracteres.');
const documento = z.record(z.unknown()).nullable();
const dia = z.string().max(10).nullable();
const ids = z.array(z.string().min(1).max(40)).max(50);

const nuevaLista = z.object({ title: titulo, body: documento.optional(), visibleToClients: z.boolean().optional() });
const nuevaTarea = z.object({
  title: titulo,
  body: documento.optional(),
  visibleToClients: z.boolean().optional(),
  dueOn: dia.optional(),
  startsOn: dia.optional(),
  assigneeIds: ids.optional(),
  campos: z.array(z.record(z.unknown())).max(MAX_CAMPOS).nullable().optional(),
  esperaA: z.string().min(1).max(40).nullable().optional(),
  diasDespues: z.number().int().min(1).max(365).nullable().optional(),
});
const respuestas = z.object({ respuestas: z.record(z.string().max(10), z.unknown()) });
const edicion = nuevaTarea.partial();

export default async function rutasTareas(app: FastifyInstance) {
  /** Todas las listas del proyecto con sus tareas (abiertas y completadas). */
  app.get<{ Params: { id: string } }>('/api/v1/proyectos/:id/tareas', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, async (tx) => listarTareas(tx, actor, await proyectoPara(tx, actor, req.params.id, 'proyecto.ver')));
  });

  app.post<{ Params: { id: string } }>('/api/v1/proyectos/:id/listas', async (req) => {
    const actor = exigirCuenta(req);
    const datos = leer(nuevaLista, req.body);
    return conCuenta(actor.ctx, async (tx) => ({ lista: await crearElemento(tx, actor, req.params.id, { type: 'todolist', ...datos }) }));
  });

  app.post<{ Params: { id: string } }>('/api/v1/listas/:id/tareas', async (req) => {
    const actor = exigirCuenta(req);
    const datos = leer(nuevaTarea, req.body);
    return conCuenta(actor.ctx, async (tx) => ({ tarea: await crearTarea(tx, actor, req.params.id, datos) }));
  });

  app.get<{ Params: { id: string } }>('/api/v1/tareas/:id', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, async (tx) => tareaDetalle(tx, actor, req.params.id));
  });

  app.patch<{ Params: { id: string } }>('/api/v1/tareas/:id', async (req) => {
    const actor = exigirCuenta(req);
    const datos = leer(edicion, req.body);
    return conCuenta(actor.ctx, async (tx) => ({ tarea: await editarTarea(tx, actor, req.params.id, datos) }));
  });

  app.post<{ Params: { id: string } }>('/api/v1/tareas/:id/completar', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, async (tx) => ({ tarea: await completarTarea(tx, actor, req.params.id, true) }));
  });

  app.post<{ Params: { id: string } }>('/api/v1/tareas/:id/reabrir', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, async (tx) => ({ tarea: await completarTarea(tx, actor, req.params.id, false) }));
  });

  /** Responder lo que pide una tarea (D-65). Solo los campos que vienen; vacío = borrar. */
  app.put<{ Params: { id: string } }>('/api/v1/tareas/:id/respuestas', async (req) => {
    const actor = exigirCuenta(req);
    const datos = leer(respuestas, req.body);
    return conCuenta(actor.ctx, async (tx) => {
      const r = await responder(tx, actor, req.params.id, datos.respuestas, completarPorRespuestas);
      return { ...r, ...(await tareaDetalle(tx, actor, req.params.id)) };
    });
  });

  /** Timeline: tareas con fecha entre desde y hasta, de un proyecto o de todos los que veo. */
  app.get('/api/v1/timeline', async (req) => {
    const actor = exigirCuenta(req);
    const q = leer(z.object({ desde: z.string().max(10), hasta: z.string().max(10), proyecto: z.string().max(40).optional() }), req.query);
    return conCuenta(actor.ctx, (tx) => timeline(tx, actor, q));
  });

  // ------------------------------------------------------------ tablero y pasos (D-68)

  /** Ver la lista como tablero (enabled: true) o como lista (false). */
  app.post<{ Params: { id: string } }>('/api/v1/listas/:id/tablero', async (req) => {
    const actor = exigirCuenta(req);
    const { enabled } = leer(z.object({ enabled: z.boolean() }), req.body);
    return conCuenta(actor.ctx, async (tx) => ({ tablero: await verComoTablero(tx, actor, req.params.id, enabled) }));
  });

  app.put<{ Params: { id: string } }>('/api/v1/listas/:id/columnas', async (req) => {
    const actor = exigirCuenta(req);
    const { columnas } = leer(z.object({ columnas: z.array(z.record(z.unknown())).max(12) }), req.body);
    return conCuenta(actor.ctx, async (tx) => ({ tablero: await fijarColumnas(tx, actor, req.params.id, columnas) }));
  });

  app.post<{ Params: { id: string } }>('/api/v1/tareas/:id/columna', async (req) => {
    const actor = exigirCuenta(req);
    const { columnaId } = leer(z.object({ columnaId: z.string().min(1).max(10) }), req.body);
    return conCuenta(actor.ctx, async (tx) => {
      await moverAColumna(tx, actor, req.params.id, columnaId);
      return tareaDetalle(tx, actor, req.params.id);
    });
  });

  app.post<{ Params: { id: string } }>('/api/v1/tareas/:id/aprobar', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, async (tx) => {
      await aprobar(tx, actor, req.params.id);
      return tareaDetalle(tx, actor, req.params.id);
    });
  });

  app.post<{ Params: { id: string } }>('/api/v1/tareas/:id/pedir-cambios', async (req) => {
    const actor = exigirCuenta(req);
    const { comentario } = leer(z.object({ comentario: z.string().max(5000) }), req.body);
    return conCuenta(actor.ctx, async (tx) => {
      await pedirCambios(tx, actor, req.params.id, comentario);
      return tareaDetalle(tx, actor, req.params.id);
    });
  });

  app.put<{ Params: { id: string } }>('/api/v1/tareas/:id/pasos', async (req) => {
    const actor = exigirCuenta(req);
    const { pasos } = leer(z.object({ pasos: z.array(z.object({ id: z.string().max(10).optional(), texto: z.string().max(200), hecho: z.boolean().optional() })).max(30) }), req.body);
    return conCuenta(actor.ctx, async (tx) => {
      await fijarPasos(tx, actor, req.params.id, pasos);
      return tareaDetalle(tx, actor, req.params.id);
    });
  });

  /** Activar ahora una tarea que espera a otra (D-67). */
  app.post<{ Params: { id: string } }>('/api/v1/tareas/:id/activar', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, async (tx) => ({ tarea: await activarAhora(tx, actor, req.params.id) }));
  });

  /** Ver un acceso protegido (D-66): solo el equipo; queda registrado quién lo vio. */
  app.post<{ Params: { id: string; campo: string } }>('/api/v1/tareas/:id/campos/:campo/ver', async (req, reply) => {
    const actor = exigirCuenta(req);
    reply.header('Cache-Control', 'no-store');
    return conCuenta(actor.ctx, (tx) => verAcceso(tx, actor, req.params.id, req.params.campo, req.ip));
  });

  /** Ficha del cliente: lo respondido en el proyecto. */
  app.get<{ Params: { id: string } }>('/api/v1/proyectos/:id/ficha', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, (tx) => fichaProyecto(tx, actor, req.params.id));
  });
}
