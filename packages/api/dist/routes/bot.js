import { z } from 'zod';
import { conCuenta } from '../lib/contexto.js';
import { leer } from '../lib/validar.js';
import { aplicarPlantillaBot, completarTareaBot, guardarPlantillaBot, crearProyectoBot, crearTareaBot, exigirBot, plantillasBot, tareasBot } from '../services/bot.js';
/**
 * API para bots (D-63, services/bot.ts). Autenticación: `Authorization: Bearer lpm_…`.
 * Documentación con ejemplos: documentacion/11-API-BOT.md.
 */
const filtroTareas = z.object({
    responsable: z.string().max(200).optional(),
    proyecto: z.string().max(200).optional(),
    cuando: z.enum(['hoy', 'manana', 'semana', 'vencidas', 'todas']).default('todas'),
    completadas: z.enum(['0', '1']).default('0'),
    limite: z.coerce.number().int().min(1).max(200).default(50),
});
const nuevaTarea = z.object({
    proyecto: z.string().trim().min(1, 'Falta el proyecto.').max(200),
    lista: z.string().trim().max(300).optional(),
    titulo: z.string().trim().min(1, 'Falta el título.').max(300),
    vence: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha va como AAAA-MM-DD.').nullable().optional(),
    responsables: z.array(z.string().max(200)).max(20).default([]),
    notas: z.string().max(10_000).optional(),
    hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora va como HH:MM (24 horas).').optional(),
    horaFin: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora va como HH:MM (24 horas).').optional(),
    lugar: z.string().max(200).optional(),
});
export default async function rutasBot(app) {
    /** Quién soy: para probar la clave. */
    app.get('/api/v1/bot/yo', async (req) => {
        const a = await exigirBot(req);
        return conCuenta(a.actor.ctx, async (tx) => {
            const u = await tx.user.findUniqueOrThrow({ where: { id: a.actor.ctx.userId }, select: { name: true } });
            return { bot: u.name, cuenta: a.slug, zonaHoraria: a.timeZone };
        });
    });
    app.get('/api/v1/bot/proyectos', async (req) => {
        const a = await exigirBot(req);
        return conCuenta(a.actor.ctx, async (tx) => ({
            proyectos: (await tx.project.findMany({
                where: { accountId: a.actor.ctx.accountId, status: 'active' },
                select: { id: true, name: true, _count: { select: { recordings: { where: { type: 'todo', status: 'active', todo: { completedAt: null } } } } } },
                orderBy: { name: 'asc' },
            })).map((p) => ({ id: p.id, nombre: p.name, tareasPendientes: p._count.recordings })),
        }));
    });
    /** Crea un proyecto (si ya hay uno activo con ese nombre, devuelve ese: no duplica). */
    app.post('/api/v1/bot/proyectos', async (req) => {
        const a = await exigirBot(req);
        const d = leer(z.object({ nombre: z.string().trim().min(1, 'Falta el nombre.').max(120), descripcion: z.string().max(2000).optional() }), req.body);
        return crearProyectoBot(a, d);
    });
    /** El equipo (para asignar): nombre y correo. */
    app.get('/api/v1/bot/personas', async (req) => {
        const a = await exigirBot(req);
        return conCuenta(a.actor.ctx, async (tx) => ({
            personas: (await tx.membership.findMany({
                where: { accountId: a.actor.ctx.accountId, status: 'active', role: { not: 'client' }, user: { isBot: false } },
                select: { role: true, user: { select: { name: true, email: true } } },
                orderBy: { user: { name: 'asc' } },
            })).map((m) => ({ nombre: m.user.name, correo: m.user.email, rol: m.role })),
        }));
    });
    app.get('/api/v1/bot/tareas', async (req) => {
        const a = await exigirBot(req);
        const f = leer(filtroTareas, req.query);
        return tareasBot(a, { ...f, cuando: f.cuando ?? 'todas', completadas: f.completadas === '1', limite: f.limite ?? 50 });
    });
    app.post('/api/v1/bot/tareas', async (req) => {
        const a = await exigirBot(req);
        const d = leer(nuevaTarea, req.body);
        return { tarea: await crearTareaBot(a, { ...d, responsables: d.responsables ?? [] }) };
    });
    app.post('/api/v1/bot/tareas/:id/completar', async (req) => {
        const a = await exigirBot(req);
        return { tarea: await completarTareaBot(a, req.params.id, true) };
    });
    app.post('/api/v1/bot/tareas/:id/reabrir', async (req) => {
        const a = await exigirBot(req);
        return { tarea: await completarTareaBot(a, req.params.id, false) };
    });
    app.get('/api/v1/bot/plantillas', async (req) => plantillasBot(await exigirBot(req)));
    /** Crear una plantilla, o reemplazarla entera si ya hay una con ese nombre. */
    app.post('/api/v1/bot/plantillas', async (req) => {
        const a = await exigirBot(req);
        const campo = z.object({ nombre: z.string().trim().min(1).max(120), tipo: z.string().max(20), obligatorio: z.boolean().optional(), ayuda: z.string().max(300).optional() });
        const d = leer(z.object({
            nombre: z.string().trim().min(1, 'Falta el nombre.').max(200),
            descripcion: z.string().max(2000).optional(),
            tareas: z
                .array(z.object({
                titulo: z.string().trim().min(1, 'Cada tarea necesita un título.').max(300),
                para: z.enum(['equipo', 'cliente', 'cualquiera']).optional(),
                dia: z.number().int().min(1).max(365).nullable().optional(),
                notas: z.string().max(5000).optional(),
                espera: z.number().int().min(1).max(100).nullable().optional(),
                pide: z.array(campo).max(20).optional(),
            }))
                .max(100),
        }), req.body);
        return guardarPlantillaBot(a, d);
    });
    /** Agregar una plantilla a un proyecto (ambos por nombre). */
    app.post('/api/v1/bot/plantillas/aplicar', async (req) => {
        const a = await exigirBot(req);
        const d = leer(z.object({
            proyecto: z.string().trim().min(1, 'Falta el proyecto.').max(200),
            plantilla: z.string().trim().min(1, 'Falta la plantilla.').max(200),
            inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha va como AAAA-MM-DD.').optional(),
            responsable: z.string().max(200).optional(),
            lista: z.string().trim().max(300).optional(),
        }), req.body);
        return aplicarPlantillaBot(a, d);
    });
}
