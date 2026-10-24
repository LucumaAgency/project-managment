import { z } from 'zod';
import { conCuenta } from '../lib/contexto.js';
import { leer } from '../lib/validar.js';
import { buscar } from '../services/busqueda.js';
import { exigirCuenta } from '../plugins/contexto.js';
const filtro = z.object({
    q: z.string().max(200, 'La búsqueda es demasiado larga.').default(''),
    proyecto: z.string().max(40).optional(),
});
/** GET /buscar?q=…[&proyecto=id]: lo que la persona puede ver (services/busqueda.ts). */
export default async function rutasBusqueda(app) {
    app.get('/api/v1/buscar', async (req) => {
        const actor = exigirCuenta(req);
        const { q = '', proyecto } = leer(filtro, req.query);
        return conCuenta(actor.ctx, (tx) => buscar(tx, actor, q, { proyectoId: proyecto }));
    });
}
