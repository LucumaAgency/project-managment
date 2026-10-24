import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { conCuenta } from '../lib/contexto.js';
import { leer } from '../lib/validar.js';
import { comentar, listarComentarios, seguir } from '../services/comentarios.js';
import { exigirCuenta } from '../plugins/contexto.js';

/** Editar y borrar un comentario: PATCH /elementos/:id y POST /elementos/:id/papelera. */
const nuevo = z.object({ body: z.record(z.unknown()) });

export default async function rutasComentarios(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/v1/elementos/:id/comentarios', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, (tx) => listarComentarios(tx, actor, req.params.id));
  });

  app.post<{ Params: { id: string } }>('/api/v1/elementos/:id/comentarios', async (req) => {
    const actor = exigirCuenta(req);
    const { body } = leer(nuevo, req.body);
    return conCuenta(actor.ctx, async (tx) => ({ comentario: await comentar(tx, actor, req.params.id, body) }));
  });

  app.post<{ Params: { id: string } }>('/api/v1/elementos/:id/seguir', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, (tx) => seguir(tx, actor, req.params.id, true));
  });

  app.post<{ Params: { id: string } }>('/api/v1/elementos/:id/dejar-de-seguir', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, (tx) => seguir(tx, actor, req.params.id, false));
  });
}
