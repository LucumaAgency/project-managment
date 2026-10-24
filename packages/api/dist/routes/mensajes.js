import { z } from 'zod';
import { conCuenta } from '../lib/contexto.js';
import { leer } from '../lib/validar.js';
import { actividadDelProyecto } from '../services/actividad.js';
import { listarMensajes } from '../services/mensajes.js';
import { proyectoPara } from '../services/proyectos.js';
import { exigirCuenta } from '../plugins/contexto.js';
/**
 * Mensajes: el listado. Publicar, ver, editar y borrar usan las rutas genéricas de elementos
 * (type: 'message'); comentarios y seguir, las de comentarios.
 */
const pagina = z.object({
    antes: z.string().datetime({ message: 'Fecha inválida.' }).optional(),
    limite: z.coerce.number().int().min(1).max(100).optional(),
});
export default async function rutasMensajes(app) {
    app.get('/api/v1/proyectos/:id/mensajes', async (req) => {
        const actor = exigirCuenta(req);
        return conCuenta(actor.ctx, async (tx) => listarMensajes(tx, actor, await proyectoPara(tx, actor, req.params.id, 'proyecto.ver')));
    });
    /** Actividad del proyecto, del más nuevo al más viejo, de a 30 (?antes= para seguir). */
    app.get('/api/v1/proyectos/:id/actividad', async (req) => {
        const actor = exigirCuenta(req);
        const q = leer(pagina, req.query);
        return conCuenta(actor.ctx, async (tx) => actividadDelProyecto(tx, actor, await proyectoPara(tx, actor, req.params.id, 'proyecto.ver'), {
            antes: q.antes ? new Date(q.antes) : undefined,
            limite: q.limite,
        }));
    });
}
