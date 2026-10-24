import type { FastifyInstance } from 'fastify';
import { esCliente, veTodosLosProyectos } from '@lucuma-pm/shared';
import { z } from 'zod';
import { conCuenta, type Tx } from '../lib/contexto.js';
import { HttpError } from '../lib/errores.js';
import { leer } from '../lib/validar.js';
import { registrarEvento } from '../services/eventos.js';
import { puede, type Accion, type Actor, type ProyectoCargado } from '../services/permisos.js';
import { exigirCupoProyectos, proyectoPara } from '../services/proyectos.js';
import { exigirCuenta } from '../plugins/contexto.js';

const nombre = z.string().trim().min(1, 'Ponle un nombre al proyecto.').max(120, 'Máximo 120 caracteres.');
const descripcion = z.string().trim().max(1000, 'Máximo 1000 caracteres.');
const nuevo = z.object({ name: nombre, description: descripcion.optional() });
const edicion = z
  .object({ name: nombre.optional(), description: descripcion.nullable().optional() })
  .refine((d) => d.name !== undefined || d.description !== undefined, 'No hay nada que cambiar.');
const filtroLista = z.object({ estado: z.enum(['active', 'archived', 'trashed']).default('active') });
const persona = z.object({ userId: z.string().min(1).max(40) });

/** Lo que la web necesita saber de sus permisos en el proyecto, para mostrar u ocultar botones. */
function permisosEn(actor: Actor, proyecto: ProyectoCargado) {
  const acciones: Accion[] = ['proyecto.editar', 'proyecto.archivar', 'proyecto.papelera', 'proyecto.personas', 'proyecto.verPapelera'];
  return Object.fromEntries(acciones.map((a) => [a.split('.')[1], puede(actor, a, { proyecto })])) as Record<string, boolean>;
}

async function personasDelProyecto(tx: Tx, accountId: string, projectId: string, verCorreos: boolean) {
  const filas = await tx.projectMember.findMany({
    where: { projectId, accountId },
    select: { user: { select: { id: true, name: true, email: true } }, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const ids = filas.map((f) => f.user.id);
  const membresias = await tx.membership.findMany({
    where: { accountId, userId: { in: ids } },
    select: { userId: true, role: true, company: true, status: true },
  });
  const de = new Map(membresias.map((m) => [m.userId, m]));
  return filas
    .filter((f) => de.get(f.user.id)?.status === 'active')
    .map((f) => ({
      userId: f.user.id,
      name: f.user.name,
      // Un cliente ve los nombres del equipo, no sus correos.
      email: verCorreos ? f.user.email : null,
      role: de.get(f.user.id)!.role,
      company: de.get(f.user.id)!.company,
    }));
}

export default async function rutasProyectos(app: FastifyInstance) {
  /**
   * Proyectos que puedo ver. Owner y admin ven todos; el resto, donde es miembro. Archivados
   * con ?estado=archived; papelera (solo owner/admin) con ?estado=trashed.
   */
  app.get('/api/v1/proyectos', async (req) => {
    const actor = exigirCuenta(req);
    const { estado } = leer(filtroLista, req.query);
    const todos = veTodosLosProyectos(actor.rol);
    if (estado === 'trashed' && !todos) throw new HttpError(403, 'Solo dueños y administradores ven la papelera.');

    return conCuenta(actor.ctx, async (tx) => {
      const proyectos = await tx.project.findMany({
        where: {
          accountId: actor.ctx.accountId,
          status: estado,
          ...(todos ? {} : { members: { some: { userId: actor.ctx.userId } } }),
        },
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          archivedAt: true,
          trashedAt: true,
          _count: { select: { members: true } },
          members: { where: { userId: actor.ctx.userId }, select: { id: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });
      return {
        proyectos: proyectos.map(({ _count, members, ...p }) => ({ ...p, personas: _count.members, soyMiembro: members.length > 0 })),
        puedeCrear: puede(actor, 'proyecto.crear'),
      };
    });
  });

  /** Crea un proyecto. Quien lo crea queda dentro. Respeta el límite de proyectos del plan. */
  app.post('/api/v1/proyectos', async (req) => {
    const actor = exigirCuenta(req);
    const datos = leer(nuevo, req.body);
    if (!puede(actor, 'proyecto.crear')) throw new HttpError(403, 'Los clientes no crean proyectos.');
    return conCuenta(actor.ctx, async (tx) => {
      await exigirCupoProyectos(tx, actor.ctx.accountId);
      const p = await tx.project.create({
        data: {
          accountId: actor.ctx.accountId,
          name: datos.name,
          description: datos.description || null,
          createdById: actor.ctx.userId,
          members: { create: { accountId: actor.ctx.accountId, userId: actor.ctx.userId } },
        },
        select: { id: true, name: true, description: true, status: true },
      });
      await registrarEvento(tx, { accountId: actor.ctx.accountId, projectId: p.id, actorId: actor.ctx.userId, action: 'created' });
      return { proyecto: p };
    });
  });

  /** Detalle: datos, personas, cuántos elementos hay por sección y qué puedo hacer. */
  app.get<{ Params: { id: string } }>('/api/v1/proyectos/:id', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, async (tx) => {
      const p = await proyectoPara(tx, actor, req.params.id, 'proyecto.ver');
      const cliente = esCliente(actor.rol);
      const [personas, conteos] = await Promise.all([
        personasDelProyecto(tx, actor.ctx.accountId, p.id, !cliente),
        tx.recording.groupBy({
          by: ['type'],
          where: {
            projectId: p.id,
            status: 'active',
            parentId: null,
            ...(cliente ? { visibleToClients: true } : {}),
          },
          _count: { _all: true },
        }),
      ]);
      const cuantos = Object.fromEntries(conteos.map((c) => [c.type, c._count._all]));
      return {
        proyecto: {
          id: p.id,
          name: p.name,
          description: p.description,
          status: p.status,
          createdAt: p.createdAt,
          archivedAt: p.archivedAt,
          trashedAt: p.trashedAt,
          soyMiembro: p.esMiembro,
        },
        personas,
        secciones: {
          tareas: cuantos.todolist ?? 0,
          mensajes: cuantos.message ?? 0,
          archivos: (cuantos.folder ?? 0) + (cuantos.upload ?? 0),
        },
        permisos: permisosEn(actor, p),
      };
    });
  });

  app.patch<{ Params: { id: string } }>('/api/v1/proyectos/:id', async (req) => {
    const actor = exigirCuenta(req);
    const datos = leer(edicion, req.body);
    return conCuenta(actor.ctx, async (tx) => {
      const p = await proyectoPara(tx, actor, req.params.id, 'proyecto.editar', 'Solo el equipo del proyecto puede editarlo.');
      const editado = await tx.project.update({
        where: { id: p.id },
        data: { name: datos.name, description: datos.description === undefined ? undefined : datos.description || null },
        select: { id: true, name: true, description: true, status: true },
      });
      await registrarEvento(tx, {
        accountId: actor.ctx.accountId,
        projectId: p.id,
        actorId: actor.ctx.userId,
        action: 'updated',
        details: datos.name && datos.name !== p.name ? { name: { from: p.name, to: datos.name } } : {},
      });
      return { proyecto: editado };
    });
  });

  /** Cambia el estado: archivar (solo lectura), reactivar, papelera y restaurar. */
  const transiciones = {
    archivar: { accion: 'proyecto.archivar', desde: ['active'], a: 'archived', evento: 'archived' },
    reactivar: { accion: 'proyecto.archivar', desde: ['archived'], a: 'active', evento: 'unarchived' },
    papelera: { accion: 'proyecto.papelera', desde: ['active', 'archived'], a: 'trashed', evento: 'trashed' },
    restaurar: { accion: 'proyecto.papelera', desde: ['trashed'], a: 'active', evento: 'restored' },
  } as const;

  for (const [ruta, t] of Object.entries(transiciones)) {
    app.post<{ Params: { id: string } }>(`/api/v1/proyectos/:id/${ruta}`, async (req) => {
      const actor = exigirCuenta(req);
      return conCuenta(actor.ctx, async (tx) => {
        const p = await proyectoPara(tx, actor, req.params.id, t.accion, 'Solo dueños y administradores.');
        if (!(t.desde as readonly string[]).includes(p.status)) throw new HttpError(409, 'El proyecto no está en un estado que permita esto.');
        if (t.a === 'active') await exigirCupoProyectos(tx, actor.ctx.accountId);
        const ahora = new Date();
        const editado = await tx.project.update({
          where: { id: p.id },
          data: {
            status: t.a,
            archivedAt: t.a === 'archived' ? ahora : t.a === 'active' ? null : undefined,
            trashedAt: t.a === 'trashed' ? ahora : null,
          },
          select: { id: true, name: true, status: true },
        });
        await registrarEvento(tx, { accountId: actor.ctx.accountId, projectId: p.id, actorId: actor.ctx.userId, action: t.evento });
        return { proyecto: editado };
      });
    });
  }

  /** Suma al proyecto a alguien que ya está en la cuenta (equipo o cliente). */
  app.post<{ Params: { id: string } }>('/api/v1/proyectos/:id/personas', async (req) => {
    const actor = exigirCuenta(req);
    const { userId } = leer(persona, req.body);
    return conCuenta(actor.ctx, async (tx) => {
      const p = await proyectoPara(tx, actor, req.params.id, 'proyecto.personas', 'Solo el equipo del proyecto puede sumar personas.');
      const m = await tx.membership.findFirst({ where: { accountId: actor.ctx.accountId, userId, status: 'active' }, select: { id: true } });
      if (!m) throw new HttpError(404, 'Esa persona no está en la cuenta. Invítala primero.');
      const ya = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: p.id, userId } } });
      if (!ya) {
        await tx.projectMember.create({ data: { accountId: actor.ctx.accountId, projectId: p.id, userId } });
        await registrarEvento(tx, { accountId: actor.ctx.accountId, projectId: p.id, actorId: actor.ctx.userId, action: 'member_added', details: { userId } });
      }
      return { personas: await personasDelProyecto(tx, actor.ctx.accountId, p.id, true) };
    });
  });

  /** Saca a alguien del proyecto (sigue en la cuenta). */
  app.delete<{ Params: { id: string; userId: string } }>('/api/v1/proyectos/:id/personas/:userId', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, async (tx) => {
      const p = await proyectoPara(tx, actor, req.params.id, 'proyecto.personas', 'Solo el equipo del proyecto puede quitar personas.');
      const borrados = await tx.projectMember.deleteMany({ where: { projectId: p.id, userId: req.params.userId } });
      if (borrados.count) {
        await registrarEvento(tx, {
          accountId: actor.ctx.accountId,
          projectId: p.id,
          actorId: actor.ctx.userId,
          action: 'member_removed',
          details: { userId: req.params.userId },
        });
      }
      return { personas: await personasDelProyecto(tx, actor.ctx.accountId, p.id, true) };
    });
  });
}
