import type { FastifyInstance } from 'fastify';
import { cuentaParaLimite, gestionaPersonas, puedeInvitar, ROLES_ASIGNABLES, type Rol } from '@lucuma-pm/shared';
import { z } from 'zod';
import { auditar } from '../lib/auditoria.js';
import { conCuenta } from '../lib/contexto.js';
import { HttpError } from '../lib/errores.js';
import { exigirCupoUsuarios, planDeCuenta, usuariosEnUso } from '../lib/plan.js';
import { leer } from '../lib/validar.js';
import { exigirCuenta } from '../plugins/contexto.js';

const cambio = z
  .object({
    role: z.enum(ROLES_ASIGNABLES).optional(),
    status: z.enum(['active', 'disabled']).optional(),
    company: z.string().trim().max(120).nullable().optional(),
  })
  .refine((c) => c.role !== undefined || c.status !== undefined || c.company !== undefined, 'No hay nada que cambiar.');

export default async function rutasPersonas(app: FastifyInstance) {
  /**
   * Personas de la cuenta e invitaciones pendientes. Los clientes no ven esta lista (verán a
   * la gente de sus proyectos, día 5). El equipo ve a todos y solo sus propias invitaciones.
   */
  app.get('/api/v1/personas', async (req) => {
    const { ctx, rol } = exigirCuenta(req);
    if (rol === 'client') throw new HttpError(403, 'No tienes acceso a esta sección.');
    const gestiona = gestionaPersonas(rol);

    return conCuenta(ctx, async (tx) => {
      const [miembros, invitaciones, plan, enUso] = await Promise.all([
        tx.membership.findMany({
          where: { accountId: ctx.accountId },
          select: {
            id: true,
            role: true,
            status: true,
            company: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true, lastLoginAt: true, isBot: true } },
          },
          orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        }),
        tx.invitation.findMany({
          where: {
            accountId: ctx.accountId,
            acceptedAt: null,
            ...(gestiona ? {} : { invitedById: ctx.userId }),
          },
          select: { id: true, email: true, role: true, projectId: true, expiresAt: true, createdAt: true, invitedById: true },
          orderBy: { createdAt: 'desc' },
        }),
        planDeCuenta(tx, ctx.accountId),
        usuariosEnUso(tx, ctx.accountId, { conPendientes: true }),
      ]);
      const ahora = new Date();
      return {
        personas: miembros.map((m) => ({
          id: m.id,
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
          status: m.status,
          company: m.company,
          lastLoginAt: m.user.lastLoginAt,
          esYo: m.user.id === ctx.userId,
          esBot: m.user.isBot,
        })),
        invitaciones: invitaciones.map((i) => ({ ...i, vencida: i.expiresAt <= ahora })),
        plan: { nombre: plan.nombre, maxUsuarios: plan.maxUsuarios, usuariosEnUso: enUso },
        permisos: {
          gestionar: gestiona,
          invitar: ROLES_ASIGNABLES.filter((r) => puedeInvitar(rol, r)),
        },
      };
    });
  });

  /**
   * Cambia rol, estado (activar/desactivar) o empresa de una persona. Solo owner y admin.
   * No se toca al dueño (la transferencia es aparte) ni a uno mismo (para no quedarse fuera).
   * Desactivar corta el acceso en la petición siguiente: la membresía se revisa en cada una.
   */
  app.patch<{ Params: { id: string } }>('/api/v1/personas/:id', async (req) => {
    const { ctx, rol } = exigirCuenta(req);
    if (!gestionaPersonas(rol)) throw new HttpError(403, 'Solo dueños y administradores gestionan personas.');
    const datos = leer(cambio, req.body);

    return conCuenta(ctx, async (tx) => {
      const m = await tx.membership.findFirst({ where: { id: req.params.id, accountId: ctx.accountId } });
      if (!m) throw new HttpError(404, 'Esa persona no está en la cuenta.');
      if (m.role === 'owner') throw new HttpError(403, 'Al dueño no se le cambia el rol ni se le desactiva.');
      if (m.userId === ctx.userId && (datos.role || datos.status)) {
        throw new HttpError(400, 'No puedes cambiar tu propio rol ni desactivarte.');
      }

      const rolFinal: Rol = datos.role ?? m.role;
      const activaFinal = (datos.status ?? m.status) === 'active';
      const yaContaba = m.status === 'active' && cuentaParaLimite(m.role);
      if (activaFinal && cuentaParaLimite(rolFinal) && !yaContaba) {
        await exigirCupoUsuarios(tx, ctx.accountId, { conPendientes: true });
      }

      const actualizado = await tx.membership.update({
        where: { id: m.id },
        data: { role: datos.role, status: datos.status, company: datos.company },
        select: { id: true, role: true, status: true, company: true },
      });
      await auditar(
        {
          accountId: ctx.accountId,
          userId: ctx.userId,
          action: 'persona.cambio',
          ip: req.ip,
          meta: { membershipId: m.id, antes: { role: m.role, status: m.status }, despues: { role: actualizado.role, status: actualizado.status } },
        },
        tx
      );
      return { persona: actualizado };
    });
  });
}
