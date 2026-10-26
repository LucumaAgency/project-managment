import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { conCuenta } from '../lib/contexto.js';
import { leer } from '../lib/validar.js';
import { MAX_CAMPOS } from '../services/campos.js';
import { MAX_DIA, MAX_TAREAS_PLANTILLA, aplicarPlantilla, borrarPlantilla, guardarPlantilla, listarPlantillas, plantillaDesdeLista, plantillaDetalle } from '../services/plantillas.js';
import { exigirCuenta } from '../plugins/contexto.js';
import { MAX_DIA_REPETICION, quitarRepeticion, repeticionesDelProyecto } from '../services/repeticiones.js';

const tarea = z.object({
  title: z.string().max(300, 'Máximo 300 caracteres.'),
  notes: z.string().max(5000).nullable().optional(),
  audience: z.enum(['team', 'client', 'any']),
  dayOffset: z.number().int().min(1).max(MAX_DIA).nullable().optional(),
  campos: z.array(z.record(z.unknown())).max(MAX_CAMPOS).nullable().optional(),
  waitsFor: z.number().int().min(1).max(MAX_TAREAS_PLANTILLA).nullable().optional(),
});
const plantilla = z.object({
  name: z.string().max(200, 'Máximo 200 caracteres.'),
  description: z.string().max(2000).nullable().optional(),
  listTitle: z.string().max(300).nullable().optional(),
  folderPath: z.string().max(600).nullable().optional(),
  folderVisibleToClients: z.boolean().optional(),
  items: z.array(tarea).max(MAX_TAREAS_PLANTILLA, `Como máximo ${MAX_TAREAS_PLANTILLA} tareas.`),
});
const aplicar = z.object({
  plantillaId: z.string().min(1).max(40),
  inicio: z.string().max(10).optional(),
  titulo: z.string().max(300).optional(),
  responsableId: z.string().min(1).max(40).nullable().optional(),
  clienteIds: z.array(z.string().min(1).max(40)).max(50).optional(),
  repetirDia: z.number().int().min(1).max(MAX_DIA_REPETICION).nullable().optional(),
});
const desdeLista = z.object({ name: z.string().max(200).optional() });

export default async function rutasPlantillas(app: FastifyInstance) {
  app.get('/api/v1/plantillas', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, (tx) => listarPlantillas(tx, actor));
  });

  app.post('/api/v1/plantillas', async (req) => {
    const actor = exigirCuenta(req);
    const datos = leer(plantilla, req.body);
    return conCuenta(actor.ctx, (tx) => guardarPlantilla(tx, actor, null, datos));
  });

  app.get<{ Params: { id: string } }>('/api/v1/plantillas/:id', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, (tx) => plantillaDetalle(tx, actor, req.params.id));
  });

  app.put<{ Params: { id: string } }>('/api/v1/plantillas/:id', async (req) => {
    const actor = exigirCuenta(req);
    const datos = leer(plantilla, req.body);
    return conCuenta(actor.ctx, (tx) => guardarPlantilla(tx, actor, req.params.id, datos));
  });

  app.delete<{ Params: { id: string } }>('/api/v1/plantillas/:id', async (req) => {
    const actor = exigirCuenta(req);
    await conCuenta(actor.ctx, (tx) => borrarPlantilla(tx, actor, req.params.id));
    return { ok: true };
  });

  /** "Guardar como plantilla" desde una lista del proyecto. */
  app.post<{ Params: { id: string } }>('/api/v1/listas/:id/plantilla', async (req) => {
    const actor = exigirCuenta(req);
    const datos = leer(desdeLista, req.body ?? {});
    return conCuenta(actor.ctx, (tx) => plantillaDesdeLista(tx, actor, req.params.id, datos.name));
  });

  /** Agregar una plantilla al proyecto: crea la lista con sus tareas. */
  app.post<{ Params: { id: string } }>('/api/v1/proyectos/:id/plantillas', async (req) => {
    const actor = exigirCuenta(req);
    const datos = leer(aplicar, req.body);
    return conCuenta(actor.ctx, (tx) => aplicarPlantilla(tx, actor, req.params.id, datos));
  });

  /** Plantillas que se agregan solas cada mes en el proyecto (D-73). */
  app.get<{ Params: { id: string } }>('/api/v1/proyectos/:id/repeticiones', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, (tx) => repeticionesDelProyecto(tx, actor, req.params.id));
  });

  app.delete<{ Params: { id: string } }>('/api/v1/repeticiones/:id', async (req) => {
    const actor = exigirCuenta(req);
    await conCuenta(actor.ctx, (tx) => quitarRepeticion(tx, actor, req.params.id));
    return { ok: true };
  });
}
