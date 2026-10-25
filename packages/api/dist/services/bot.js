/**
 * API para bots (D-63): el bot de Telegram de Lucuma (o cualquier integración) consulta, crea
 * y completa tareas con una clave de API.
 *
 * - El bot es un usuario aparte (`users.isBot`), administrador de la cuenta para ver todos los
 *   proyectos, y figura con su nombre en la actividad ("Bot Lucuma creó la tarea…").
 * - La clave SOLO sirve en /api/v1/bot/*: el resto de la API la ignora (exige sesión). Así lo
 *   delicado (personas, exportar, papelera, contraseñas) queda fuera de su alcance aunque
 *   sea administrador.
 * - Se guarda la huella (sha256), nunca la clave. Revocar es inmediato.
 * - Los proyectos y personas se pueden nombrar como los diría alguien en un chat: "fenix",
 *   "Fénix · Google Ads", un id; "carlos", un correo.
 */
import { createHash, randomBytes } from 'node:crypto';
import { prisma, prismaAdmin } from '../db.js';
import { env } from '../env.js';
import { sinTildes } from '../lib/busqueda.js';
import { conCuenta } from '../lib/contexto.js';
import { urlEnCuenta } from '../lib/enlaces.js';
import { HttpError } from '../lib/errores.js';
import { crearElemento } from './elementos.js';
import { registrarEvento } from './eventos.js';
import { exigirCupoProyectos } from './proyectos.js';
import { aplicarPlantilla, guardarPlantilla, listarPlantillas } from './plantillas.js';
import { diaEn, sumarDias } from './recordatorios.js';
import { completarTarea, crearTarea } from './tareas.js';
export const huella = (clave) => createHash('sha256').update(clave).digest('hex');
/** Crea una clave para un bot. Devuelve la clave en claro: se muestra UNA vez. */
export async function crearClave(accountId, userId, nombre) {
    const clave = `lpm_${randomBytes(24).toString('base64url')}`;
    await prismaAdmin.apiKey.create({ data: { accountId, userId, name: nombre, prefix: clave.slice(0, 10), keyHash: huella(clave) } });
    return clave;
}
const usos = new Map();
/** `Authorization: Bearer lpm_…` → quién es y en qué cuenta. 401 con cualquier problema. */
export async function exigirBot(req) {
    const m = /^Bearer\s+(lpm_[A-Za-z0-9_-]{20,})$/.exec(String(req.headers.authorization ?? ''));
    if (!m)
        throw new HttpError(401, 'Falta la clave de API (Authorization: Bearer lpm_…).');
    const [k] = await prisma.$queryRaw `SELECT * FROM api_key_por_hash(${huella(m[1])})`;
    if (!k || k.revocada || k.cuentaCerrada || !k.esBot || !k.miembroActivo || !k.rol)
        throw new HttpError(401, 'Clave de API inválida o revocada.');
    const actor = { ctx: { accountId: k.accountId, userId: k.userId }, rol: k.rol };
    const cuenta = await conCuenta(actor.ctx, (tx) => tx.account.findUniqueOrThrow({ where: { id: k.accountId }, select: { slug: true, timeZone: true } }));
    // Último uso: como mucho una escritura cada 10 minutos por clave.
    if (Date.now() - (usos.get(k.id) ?? 0) > 600_000) {
        usos.set(k.id, Date.now());
        await conCuenta(actor.ctx, (tx) => tx.apiKey.update({ where: { id: k.id }, data: { lastUsedAt: new Date() } }));
    }
    return { actor, keyId: k.id, slug: cuenta.slug, timeZone: cuenta.timeZone };
}
const normal = (t) => sinTildes(t).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Un proyecto activo por id o por nombre (exacto, o que lo contenga). 404/409 con opciones. */
export async function proyectoPorNombre(tx, a, nombre) {
    const proyectos = await tx.project.findMany({ where: { accountId: a.actor.ctx.accountId, status: 'active' }, select: { id: true, name: true } });
    const porId = proyectos.find((p) => p.id === nombre);
    if (porId)
        return porId;
    const q = normal(nombre);
    const exactos = proyectos.filter((p) => normal(p.name) === q);
    if (exactos.length === 1)
        return exactos[0];
    const parecidos = proyectos.filter((p) => normal(p.name).includes(q));
    if (parecidos.length === 1)
        return parecidos[0];
    if (!parecidos.length)
        throw new HttpError(404, `No hay un proyecto activo que se llame «${nombre}».`);
    throw new HttpError(409, `«${nombre}» coincide con varios proyectos: ${parecidos.map((p) => p.name).join(' · ')}. Sé más específico.`);
}
/** Gente del equipo por correo, id o nombre ("carlos"). Nunca clientes ni otros bots. */
export async function personasPorNombre(tx, a, nombres) {
    if (!nombres.length)
        return [];
    const equipo = await tx.membership.findMany({
        where: { accountId: a.actor.ctx.accountId, status: 'active', role: { not: 'client' }, user: { isBot: false } },
        select: { user: { select: { id: true, name: true, email: true } } },
    });
    return nombres.map((n) => {
        const q = n.trim().toLowerCase();
        const directo = equipo.find((m) => m.user.id === n || m.user.email.toLowerCase() === q);
        if (directo)
            return directo.user;
        const parecidos = equipo.filter((m) => normal(m.user.name).split(' ').some((w) => w.startsWith(normal(n))) || normal(m.user.name) === normal(n));
        if (parecidos.length === 1)
            return parecidos[0].user;
        if (!parecidos.length)
            throw new HttpError(404, `No hay nadie del equipo que se llame «${n}».`);
        throw new HttpError(409, `«${n}» coincide con varias personas: ${parecidos.map((m) => m.user.name).join(' · ')}. Usa el correo.`);
    });
}
export const enlaceTarea = (a, projectId, id) => urlEnCuenta(env.baseDomain, a.slug, `/proyectos/${projectId}/tareas`, { tarea: id });
/** Tareas pendientes (o recién completadas) con filtros de chat. */
export async function tareasBot(a, filtros) {
    return conCuenta(a.actor.ctx, async (tx) => {
        const hoy = diaEn(a.timeZone);
        const fecha = (d) => new Date(`${d}T00:00:00Z`);
        const venceFiltro = filtros.cuando === 'hoy' ? { equals: fecha(hoy) }
            : filtros.cuando === 'manana' ? { equals: fecha(sumarDias(hoy, 1)) }
                : filtros.cuando === 'semana' ? { gte: fecha(hoy), lte: fecha(sumarDias(hoy, 7)) }
                    : filtros.cuando === 'vencidas' ? { lt: fecha(hoy) }
                        : undefined;
        const proyecto = filtros.proyecto ? await proyectoPorNombre(tx, a, filtros.proyecto) : null;
        const persona = filtros.responsable ? (await personasPorNombre(tx, a, [filtros.responsable]))[0] : null;
        const filas = await tx.recording.findMany({
            where: {
                accountId: a.actor.ctx.accountId,
                type: 'todo',
                status: 'active',
                parent: { status: 'active' },
                project: { status: 'active', ...(proyecto ? { id: proyecto.id } : {}) },
                todo: {
                    completedAt: filtros.completadas ? { not: null } : null,
                    ...(venceFiltro ? { dueOn: venceFiltro } : {}),
                },
                ...(persona ? { assignees: { some: { userId: persona.id } } } : {}),
            },
            select: {
                id: true,
                title: true,
                projectId: true,
                project: { select: { name: true } },
                parent: { select: { title: true } },
                todo: { select: { dueOn: true, completedAt: true, startTime: true, endTime: true, location: true } },
                assignees: { select: { user: { select: { name: true, email: true } } } },
            },
            orderBy: filtros.completadas ? [{ todo: { completedAt: 'desc' } }] : [{ todo: { dueOn: { sort: 'asc', nulls: 'last' } } }, { createdAt: 'asc' }],
            take: filtros.limite,
        });
        return {
            hoy,
            tareas: filas.map((t) => {
                const vence = t.todo?.dueOn?.toISOString().slice(0, 10) ?? null;
                return {
                    id: t.id,
                    titulo: t.title,
                    proyecto: { id: t.projectId, nombre: t.project.name },
                    lista: t.parent?.title ?? null,
                    vence,
                    hora: t.todo?.startTime ?? null,
                    horaFin: t.todo?.endTime ?? null,
                    lugar: t.todo?.location ?? null,
                    vencida: !!vence && vence < hoy && !t.todo?.completedAt,
                    completada: t.todo?.completedAt ?? null,
                    responsables: t.assignees.map((x) => ({ nombre: x.user.name, correo: x.user.email })),
                    enlace: enlaceTarea(a, t.projectId, t.id),
                };
            }),
        };
    });
}
/** Crea una tarea. La lista se elige por nombre; sin lista, la primera del proyecto (o "Pendientes"). */
export async function crearTareaBot(a, datos) {
    return conCuenta(a.actor.ctx, async (tx) => {
        const proyecto = await proyectoPorNombre(tx, a, datos.proyecto);
        const listas = await tx.recording.findMany({
            where: { projectId: proyecto.id, type: 'todolist', status: 'active' },
            select: { id: true, title: true },
            orderBy: { position: 'asc' },
        });
        let lista = datos.lista ? listas.find((l) => normal(l.title ?? '') === normal(datos.lista)) ?? listas.find((l) => normal(l.title ?? '').includes(normal(datos.lista))) : listas[0];
        if (!lista) {
            const titulo = datos.lista?.trim() || 'Pendientes';
            lista = { id: (await crearElemento(tx, a.actor, proyecto.id, { type: 'todolist', title: titulo })).id, title: titulo };
        }
        const responsables = await personasPorNombre(tx, a, datos.responsables);
        const tarea = await crearTarea(tx, a.actor, lista.id, {
            title: datos.titulo,
            dueOn: datos.vence ?? null,
            ...(datos.hora ? { hora: datos.hora } : {}),
            ...(datos.horaFin ? { horaFin: datos.horaFin } : {}),
            ...(datos.lugar ? { lugar: datos.lugar } : {}),
            assigneeIds: responsables.map((r) => r.id),
            ...(datos.notas ? { body: { type: 'doc', content: datos.notas.split(/\n{2,}/).map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] })) } } : {}),
        });
        return {
            id: tarea.id,
            titulo: datos.titulo,
            proyecto: { id: proyecto.id, nombre: proyecto.name },
            lista: lista.title,
            vence: datos.vence ?? null,
            hora: datos.hora ?? null,
            horaFin: datos.horaFin ?? null,
            lugar: datos.lugar ?? null,
            responsables: responsables.map((r) => ({ nombre: r.name, correo: r.email })),
            enlace: enlaceTarea(a, proyecto.id, tarea.id),
        };
    });
}
export async function completarTareaBot(a, id, completar) {
    return conCuenta(a.actor.ctx, async (tx) => {
        await completarTarea(tx, a.actor, id, completar);
        const t = await tx.recording.findUniqueOrThrow({ where: { id }, select: { title: true, projectId: true, todo: { select: { completedAt: true } } } });
        return { id, titulo: t.title, completada: t.todo?.completedAt ?? null, enlace: enlaceTarea(a, t.projectId, id) };
    });
}
/**
 * Crea un proyecto. Con el mismo nombre (sin tildes ni mayúsculas) que uno activo, devuelve
 * ese y `existia: true`: el bot puede repetir el pedido sin duplicar. Respeta el límite del plan.
 */
export async function crearProyectoBot(a, datos) {
    return conCuenta(a.actor.ctx, async (tx) => {
        const activos = await tx.project.findMany({ where: { accountId: a.actor.ctx.accountId, status: 'active' }, select: { id: true, name: true } });
        const igual = activos.find((p) => normal(p.name) === normal(datos.nombre));
        if (igual)
            return { proyecto: { id: igual.id, nombre: igual.name }, existia: true };
        await exigirCupoProyectos(tx, a.actor.ctx.accountId);
        const p = await tx.project.create({
            data: {
                accountId: a.actor.ctx.accountId,
                name: datos.nombre,
                description: datos.descripcion || null,
                createdById: a.actor.ctx.userId,
                members: { create: { accountId: a.actor.ctx.accountId, userId: a.actor.ctx.userId } },
            },
            select: { id: true, name: true },
        });
        await registrarEvento(tx, { accountId: a.actor.ctx.accountId, projectId: p.id, actorId: a.actor.ctx.userId, action: 'created' });
        return { proyecto: { id: p.id, nombre: p.name }, existia: false };
    });
}
/** Plantillas de lista (D-64) con cuántas tareas tienen. */
export async function plantillasBot(a) {
    return conCuenta(a.actor.ctx, async (tx) => ({
        plantillas: (await listarPlantillas(tx, a.actor)).plantillas.map((p) => ({
            id: p.id,
            nombre: p.name,
            descripcion: p.description,
            tareas: p.tareas,
            delCliente: p.delCliente,
        })),
    }));
}
/**
 * Agrega una plantilla a un proyecto, ambos por nombre ("onboarding" en "flecha taxi").
 * Las tareas del equipo van al responsable (si no se dice, quedan sin asignar: el bot no las
 * lleva); las del cliente, a los clientes del proyecto.
 */
export async function aplicarPlantillaBot(a, datos) {
    return conCuenta(a.actor.ctx, async (tx) => {
        const proyecto = await proyectoPorNombre(tx, a, datos.proyecto);
        const todas = await tx.listTemplate.findMany({ where: { accountId: a.actor.ctx.accountId }, select: { id: true, name: true } });
        const q = normal(datos.plantilla);
        const exactas = todas.filter((p) => p.id === datos.plantilla || normal(p.name) === q);
        const parecidas = exactas.length ? exactas : todas.filter((p) => normal(p.name).includes(q));
        if (!parecidas.length)
            throw new HttpError(404, `No hay una plantilla que se llame «${datos.plantilla}».`);
        if (parecidas.length > 1)
            throw new HttpError(409, `«${datos.plantilla}» coincide con varias plantillas: ${parecidas.map((p) => p.name).join(' · ')}. Sé más específico.`);
        const responsable = datos.responsable ? (await personasPorNombre(tx, a, [datos.responsable]))[0] : null;
        const r = await aplicarPlantilla(tx, a.actor, proyecto.id, {
            plantillaId: parecidas[0].id,
            inicio: datos.inicio,
            titulo: datos.lista,
            responsableId: responsable?.id ?? null,
        });
        return {
            proyecto: { id: proyecto.id, nombre: proyecto.name },
            plantilla: parecidas[0].name,
            lista: r.lista.title,
            listaId: r.lista.id,
            tareas: r.tareas,
            inicio: r.inicio,
            responsable: responsable ? { nombre: responsable.name, correo: responsable.email } : null,
            sinCliente: r.sinCliente,
            enlace: urlEnCuenta(env.baseDomain, a.slug, `/proyectos/${proyecto.id}/tareas`),
        };
    });
}
const PARA = { equipo: 'team', cliente: 'client', cualquiera: 'any' };
const TIPO = { texto: 'texto', parrafo: 'parrafo', 'párrafo': 'parrafo', archivo: 'archivo', archivos: 'archivo', enlaces: 'enlaces', acceso: 'acceso' };
/**
 * Crea una plantilla o, si ya hay una con ese nombre (sin tildes ni mayúsculas), la reemplaza
 * entera. Para cargar las plantillas desde un archivo (documentacion/11-API-BOT.md).
 */
export async function guardarPlantillaBot(a, datos) {
    return conCuenta(a.actor.ctx, async (tx) => {
        const todas = await tx.listTemplate.findMany({ where: { accountId: a.actor.ctx.accountId }, select: { id: true, name: true } });
        const igual = todas.find((p) => normal(p.name) === normal(datos.nombre));
        const items = datos.tareas.map((t) => ({
            title: t.titulo,
            notes: t.notas ?? null,
            audience: PARA[t.para ?? 'equipo'],
            dayOffset: t.dia ?? null,
            waitsFor: t.espera ?? null,
            campos: (t.pide ?? []).map((c) => {
                const tipo = TIPO[c.tipo.toLowerCase()];
                if (!tipo)
                    throw new HttpError(400, `«${c.nombre}»: el tipo es texto, párrafo, archivo, enlaces o acceso.`);
                return { etiqueta: c.nombre, tipo, obligatorio: c.obligatorio !== false, ...(c.ayuda ? { ayuda: c.ayuda } : {}) };
            }),
        }));
        const r = await guardarPlantilla(tx, a.actor, igual?.id ?? null, { name: datos.nombre, description: datos.descripcion ?? null, items });
        return { plantilla: { id: r.plantilla.id, nombre: r.plantilla.name, tareas: r.plantilla.tareas, delCliente: r.plantilla.delCliente }, existia: !!igual };
    });
}
