import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { conCuenta } from '../lib/contexto.js';
import { HttpError } from '../lib/errores.js';
import { leer } from '../lib/validar.js';
import { contarNoLeidos, listarBandeja, marcarLeidos } from '../services/bandeja.js';
import { dispararRecordatorios } from '../services/recordatorios.js';
import { exigirCuenta } from '../plugins/contexto.js';

const pagina = z.object({
  'no-leidos': z.enum(['0', '1']).optional(),
  antes: z.string().datetime().optional(),
  limite: z.coerce.number().int().min(1).max(100).optional(),
});
const leerDe = z.object({ recordingId: z.string().min(1).max(40) });

export default async function rutasBandeja(app: FastifyInstance) {
  app.get('/api/v1/bandeja', async (req) => {
    const actor = exigirCuenta(req);
    const q = leer(pagina, req.query);
    return conCuenta(actor.ctx, (tx) =>
      listarBandeja(tx, actor, { soloNoLeidos: q['no-leidos'] === '1', antes: q.antes ? new Date(q.antes) : undefined, limite: q.limite })
    );
  });

  /** Lo pide la web cada tanto para el número del menú: tiene que ser barato. */
  app.get('/api/v1/bandeja/contador', async (req) => {
    const actor = exigirCuenta(req);
    // Red de seguridad del latido: alguien está usando la app, se revisan los recordatorios.
    dispararRecordatorios(actor.ctx.accountId, (e) => req.log.error({ err: e }, 'Recordatorios'));
    return { noLeidos: await conCuenta(actor.ctx, (tx) => contarNoLeidos(tx, actor)) };
  });

  app.post<{ Params: { id: string } }>('/api/v1/bandeja/:id/leido', async (req) => {
    const actor = exigirCuenta(req);
    const r = await conCuenta(actor.ctx, (tx) => marcarLeidos(tx, actor, { id: req.params.id }));
    if (r.marcados === 0) {
      // O ya estaba leído, o no es suyo: en los dos casos no hay nada que hacer.
      const existe = await conCuenta(actor.ctx, (tx) => tx.notification.count({ where: { id: req.params.id, userId: actor.ctx.userId } }));
      if (!existe) throw new HttpError(404, 'No encontrado.');
    }
    return r;
  });

  app.post('/api/v1/bandeja/leer-todo', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, (tx) => marcarLeidos(tx, actor, { todos: true }));
  });

  /** Al abrir una tarea, un mensaje o un archivo, sus avisos quedan leídos. */
  app.post('/api/v1/bandeja/leer', async (req) => {
    const actor = exigirCuenta(req);
    const { recordingId } = leer(leerDe, req.body);
    return conCuenta(actor.ctx, (tx) => marcarLeidos(tx, actor, { recordingId }));
  });
}
