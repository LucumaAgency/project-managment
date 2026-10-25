import { z } from 'zod';
import { conCuenta } from '../lib/contexto.js';
import { leer } from '../lib/validar.js';
import { crearElemento } from '../services/elementos.js';
import { proyectoPara } from '../services/proyectos.js';
import { completarPorRespuestas, completarTarea, crearTarea, editarTarea, listarTareas, tareaDetalle } from '../services/tareas.js';
import { MAX_CAMPOS, fichaProyecto, responder, verAcceso } from '../services/campos.js';
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
    assigneeIds: ids.optional(),
    campos: z.array(z.record(z.unknown())).max(MAX_CAMPOS).nullable().optional(),
});
const respuestas = z.object({ respuestas: z.record(z.string().max(10), z.unknown()) });
const edicion = nuevaTarea.partial();
export default async function rutasTareas(app) {
    /** Todas las listas del proyecto con sus tareas (abiertas y completadas). */
    app.get('/api/v1/proyectos/:id/tareas', async (req) => {
        const actor = exigirCuenta(req);
        return conCuenta(actor.ctx, async (tx) => listarTareas(tx, actor, await proyectoPara(tx, actor, req.params.id, 'proyecto.ver')));
    });
    app.post('/api/v1/proyectos/:id/listas', async (req) => {
        const actor = exigirCuenta(req);
        const datos = leer(nuevaLista, req.body);
        return conCuenta(actor.ctx, async (tx) => ({ lista: await crearElemento(tx, actor, req.params.id, { type: 'todolist', ...datos }) }));
    });
    app.post('/api/v1/listas/:id/tareas', async (req) => {
        const actor = exigirCuenta(req);
        const datos = leer(nuevaTarea, req.body);
        return conCuenta(actor.ctx, async (tx) => ({ tarea: await crearTarea(tx, actor, req.params.id, datos) }));
    });
    app.get('/api/v1/tareas/:id', async (req) => {
        const actor = exigirCuenta(req);
        return conCuenta(actor.ctx, async (tx) => tareaDetalle(tx, actor, req.params.id));
    });
    app.patch('/api/v1/tareas/:id', async (req) => {
        const actor = exigirCuenta(req);
        const datos = leer(edicion, req.body);
        return conCuenta(actor.ctx, async (tx) => ({ tarea: await editarTarea(tx, actor, req.params.id, datos) }));
    });
    app.post('/api/v1/tareas/:id/completar', async (req) => {
        const actor = exigirCuenta(req);
        return conCuenta(actor.ctx, async (tx) => ({ tarea: await completarTarea(tx, actor, req.params.id, true) }));
    });
    app.post('/api/v1/tareas/:id/reabrir', async (req) => {
        const actor = exigirCuenta(req);
        return conCuenta(actor.ctx, async (tx) => ({ tarea: await completarTarea(tx, actor, req.params.id, false) }));
    });
    /** Responder lo que pide una tarea (D-65). Solo los campos que vienen; vacío = borrar. */
    app.put('/api/v1/tareas/:id/respuestas', async (req) => {
        const actor = exigirCuenta(req);
        const datos = leer(respuestas, req.body);
        return conCuenta(actor.ctx, async (tx) => {
            const r = await responder(tx, actor, req.params.id, datos.respuestas, completarPorRespuestas);
            return { ...r, ...(await tareaDetalle(tx, actor, req.params.id)) };
        });
    });
    /** Ver un acceso protegido (D-66): solo el equipo; queda registrado quién lo vio. */
    app.post('/api/v1/tareas/:id/campos/:campo/ver', async (req, reply) => {
        const actor = exigirCuenta(req);
        reply.header('Cache-Control', 'no-store');
        return conCuenta(actor.ctx, (tx) => verAcceso(tx, actor, req.params.id, req.params.campo, req.ip));
    });
    /** Ficha del cliente: lo respondido en el proyecto. */
    app.get('/api/v1/proyectos/:id/ficha', async (req) => {
        const actor = exigirCuenta(req);
        return conCuenta(actor.ctx, (tx) => fichaProyecto(tx, actor, req.params.id));
    });
}
