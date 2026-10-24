import { randomBytes } from 'node:crypto';
import { cuentaParaLimite, gestionaPersonas, MIN_LARGO_PASSWORD, puedeInvitar, ROLES_ASIGNABLES, } from '@lucuma-pm/shared';
import { z } from 'zod';
import { prisma } from '../db.js';
import { abrirSesion } from '../lib/acceso.js';
import { auditar } from '../lib/auditoria.js';
import { conCuenta } from '../lib/contexto.js';
import { urlEnCuenta } from '../lib/enlaces.js';
import { HttpError } from '../lib/errores.js';
import { hashPassword } from '../lib/password.js';
import { exigirCupoUsuarios } from '../lib/plan.js';
import { hashToken } from '../lib/sesion.js';
import { leer } from '../lib/validar.js';
import { exigirCuenta } from '../plugins/contexto.js';
/**
 * Invitaciones. En el MVP no hay correo: la API devuelve el ENLACE y quien invita lo comparte
 * a mano (WhatsApp, Slack). Cuando haya correo, el mismo enlace se manda también por ahí.
 *
 * El enlace es la llave: quien lo tiene puede aceptar. Por eso dura 7 días, sirve una vez,
 * se puede anular, y si el correo ya tiene usuario hay que entrar con SU contraseña para
 * aceptar (el enlace no da acceso a una identidad que ya existe).
 */
const VIGENCIA_DIAS = 7;
const correo = z.string().trim().toLowerCase().email('Correo inválido.').max(200);
const crear = z.object({
    email: correo,
    role: z.enum(ROLES_ASIGNABLES),
    projectId: z.string().min(1).max(40).optional(),
});
const conToken = z.object({ token: z.string().min(20).max(200) });
const aceptar = conToken.extend({
    nombre: z.string().trim().min(1, 'Escribe tu nombre.').max(100).optional(),
    password: z.string().min(MIN_LARGO_PASSWORD, `La contraseña necesita mínimo ${MIN_LARGO_PASSWORD} caracteres.`).max(200).optional(),
});
/** Busca por hash del token, antes de tener cuenta fijada (función SECURITY DEFINER). */
async function invitacionPorToken(token) {
    const filas = await prisma.$queryRaw `SELECT * FROM invitacion_por_token(${hashToken(token)})`;
    return filas[0] ?? null;
}
function estadoDe(inv) {
    if (inv.cuentaCerrada)
        return 'cerrada';
    if (inv.acceptedAt)
        return 'usada';
    if (inv.expiresAt <= new Date())
        return 'vencida';
    return 'vigente';
}
function nuevoToken() {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + VIGENCIA_DIAS * 86_400_000) };
}
function enlaceDe(req, slug, token) {
    return urlEnCuenta(req.server.config.baseDomain, slug, '/invitacion', { token });
}
/** El equipo solo invita clientes a proyectos donde está; owner y admin, a cualquiera activo. */
async function validarProyecto(tx, ctx, rol, projectId) {
    if (!projectId) {
        if (!gestionaPersonas(rol))
            throw new HttpError(400, 'Elige el proyecto al que invitas al cliente.');
        return;
    }
    const p = await tx.project.findFirst({ where: { id: projectId, accountId: ctx.accountId, status: 'active' }, select: { id: true } });
    if (!p)
        throw new HttpError(404, 'Ese proyecto no existe o está archivado.');
    if (!gestionaPersonas(rol)) {
        const esta = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: ctx.userId } } });
        if (!esta)
            throw new HttpError(403, 'Solo puedes invitar a proyectos donde estás.');
    }
}
/** Quien invitó o un owner/admin pueden renovar o anular. */
async function invitacionGestionable(tx, ctx, rol, id) {
    const inv = await tx.invitation.findFirst({ where: { id, accountId: ctx.accountId, acceptedAt: null } });
    if (!inv)
        throw new HttpError(404, 'Esa invitación no existe o ya fue aceptada.');
    if (!gestionaPersonas(rol) && inv.invitedById !== ctx.userId)
        throw new HttpError(403, 'Solo quien invitó o un administrador.');
    return inv;
}
export default async function rutasInvitaciones(app) {
    /** Crea una invitación y devuelve el enlace para compartir. Reemplaza otra pendiente al mismo correo. */
    app.post('/api/v1/invitaciones', async (req) => {
        const { ctx, rol, cuenta } = exigirCuenta(req);
        const datos = leer(crear, req.body);
        if (!puedeInvitar(rol, datos.role))
            throw new HttpError(403, 'Tu rol no puede invitar con ese rol.');
        const { token, tokenHash, expiresAt } = nuevoToken();
        const invitacion = await conCuenta(ctx, async (tx) => {
            await validarProyecto(tx, ctx, rol, datos.projectId);
            const yaEsta = await tx.membership.findFirst({
                where: { accountId: ctx.accountId, status: 'active', user: { email: datos.email } },
                select: { id: true },
            });
            if (yaEsta)
                throw new HttpError(409, 'Esa persona ya está en la cuenta.');
            if (cuentaParaLimite(datos.role)) {
                await exigirCupoUsuarios(tx, ctx.accountId, { conPendientes: true, salvoEmail: datos.email });
            }
            await tx.invitation.deleteMany({ where: { accountId: ctx.accountId, email: datos.email, acceptedAt: null } });
            const inv = await tx.invitation.create({
                data: {
                    accountId: ctx.accountId,
                    email: datos.email,
                    role: datos.role,
                    projectId: datos.projectId,
                    tokenHash,
                    invitedById: ctx.userId,
                    expiresAt,
                },
                select: { id: true, email: true, role: true, projectId: true, expiresAt: true },
            });
            await auditar({ accountId: ctx.accountId, userId: ctx.userId, action: 'invitacion.crear', ip: req.ip, meta: { email: inv.email, role: inv.role, projectId: inv.projectId } }, tx);
            return inv;
        });
        return { invitacion, enlace: enlaceDe(req, cuenta.slug, token) };
    });
    /** Genera un enlace nuevo (el anterior deja de servir) y renueva los 7 días. */
    app.post('/api/v1/invitaciones/:id/renovar', async (req) => {
        const { ctx, rol, cuenta } = exigirCuenta(req);
        const { token, tokenHash, expiresAt } = nuevoToken();
        const invitacion = await conCuenta(ctx, async (tx) => {
            const inv = await invitacionGestionable(tx, ctx, rol, req.params.id);
            return tx.invitation.update({
                where: { id: inv.id },
                data: { tokenHash, expiresAt },
                select: { id: true, email: true, role: true, projectId: true, expiresAt: true },
            });
        });
        return { invitacion, enlace: enlaceDe(req, cuenta.slug, token) };
    });
    /** Anula una invitación pendiente: el enlace deja de servir. */
    app.delete('/api/v1/invitaciones/:id', async (req) => {
        const { ctx, rol } = exigirCuenta(req);
        await conCuenta(ctx, async (tx) => {
            const inv = await invitacionGestionable(tx, ctx, rol, req.params.id);
            await tx.invitation.delete({ where: { id: inv.id } });
            await auditar({ accountId: ctx.accountId, userId: ctx.userId, action: 'invitacion.anular', ip: req.ip, meta: { email: inv.email } }, tx);
        });
        return { ok: true };
    });
    /**
     * Pública: qué dice la invitación (para la pantalla de aceptar). No necesita sesión.
     * `existeUsuario` decide si la pantalla pide "crea tu contraseña" o "entra con la tuya".
     */
    app.post('/api/v1/invitacion/ver', async (req) => {
        const { token } = leer(conToken, req.body);
        const inv = await invitacionPorToken(token);
        if (!inv)
            throw new HttpError(404, 'Esta invitación no existe o fue anulada.');
        const usuario = await prisma.user.findUnique({ where: { email: inv.email }, select: { id: true } });
        return {
            estado: estadoDe(inv),
            cuenta: { slug: inv.cuentaSlug, name: inv.cuentaNombre },
            email: inv.email,
            role: inv.role,
            proyecto: inv.proyectoNombre,
            invitadoPor: inv.invitadoPor,
            expiresAt: inv.expiresAt,
            existeUsuario: !!usuario,
            sesion: req.usuario ? { email: req.usuario.email, esLaInvitada: req.usuario.email === inv.email } : null,
        };
    });
    /**
     * Acepta. Dos casos:
     *  - El correo no tiene usuario: crea la persona con nombre y contraseña y abre sesión.
     *  - Ya tiene usuario: hay que haber entrado con ESA persona (su contraseña). Si no, 401.
     * Todo en una transacción con la cuenta de la invitación fijada: si algo falla (venció en
     * el medio, límite del plan), no queda una persona creada a medias.
     */
    app.post('/api/v1/invitacion/aceptar', async (req, reply) => {
        const datos = leer(aceptar, req.body);
        const inv = await invitacionPorToken(datos.token);
        if (!inv)
            throw new HttpError(404, 'Esta invitación no existe o fue anulada.');
        const estado = estadoDe(inv);
        if (estado === 'usada')
            throw new HttpError(410, 'Esta invitación ya se usó.');
        if (estado === 'vencida')
            throw new HttpError(410, 'Esta invitación venció. Pide que te la renueven.');
        if (estado === 'cerrada')
            throw new HttpError(410, 'Esta cuenta fue cerrada.');
        const existente = await prisma.user.findUnique({ where: { email: inv.email }, select: { id: true } });
        if (existente && req.usuario?.id !== existente.id) {
            throw new HttpError(401, 'Ya tienes usuario con este correo: entra con tu contraseña para aceptar.');
        }
        if (!existente && (!datos.nombre || !datos.password)) {
            throw new HttpError(400, 'Escribe tu nombre y una contraseña.');
        }
        const passwordHash = !existente && datos.password ? await hashPassword(datos.password) : null;
        // userId del contexto: el existente, o uno nuevo que se crea dentro de la transacción.
        const resultado = await prisma.$transaction(async (tx) => {
            const userId = existente?.id ??
                (await tx.user.create({
                    data: { email: inv.email, name: datos.nombre, passwordHash, passwordChangedAt: new Date() },
                    select: { id: true },
                })).id;
            await tx.$executeRaw `SELECT set_config('app.account_id', ${inv.accountId}, true), set_config('app.user_id', ${userId}, true)`;
            // Marcar como usada en el mismo paso que se valida: dos clics no la usan dos veces.
            const usada = await tx.invitation.updateMany({
                where: { id: inv.id, acceptedAt: null, expiresAt: { gt: new Date() } },
                data: { acceptedAt: new Date() },
            });
            if (usada.count !== 1)
                throw new HttpError(410, 'Esta invitación ya se usó o venció.');
            const previa = await tx.membership.findUnique({ where: { accountId_userId: { accountId: inv.accountId, userId } } });
            if (previa?.status === 'active') {
                // Ya estaba (p. ej. del equipo y la invitan como cliente a un proyecto): no se le baja el rol.
            }
            else {
                if (cuentaParaLimite(inv.role))
                    await exigirCupoUsuarios(tx, inv.accountId);
                await tx.membership.upsert({
                    where: { accountId_userId: { accountId: inv.accountId, userId } },
                    create: { accountId: inv.accountId, userId, role: inv.role },
                    update: { role: inv.role, status: 'active' },
                });
            }
            if (inv.projectId) {
                await tx.projectMember.upsert({
                    where: { projectId_userId: { projectId: inv.projectId, userId } },
                    create: { accountId: inv.accountId, projectId: inv.projectId, userId },
                    update: {},
                });
            }
            await auditar({ accountId: inv.accountId, userId, action: 'invitacion.aceptar', ip: req.ip, meta: { invitacionId: inv.id, nueva: !existente } }, tx);
            return { userId };
        }, { maxWait: 5_000, timeout: 15_000 });
        const sesion = existente ? null : await abrirSesion(req, reply, { id: resultado.userId }, 'invitacion');
        return { ok: true, cuenta: { slug: inv.cuentaSlug, name: inv.cuentaNombre }, sesion };
    });
}
