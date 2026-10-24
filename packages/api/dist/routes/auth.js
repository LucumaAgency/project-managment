import { randomBytes } from 'node:crypto';
import { MIN_LARGO_PASSWORD } from '@lucuma-pm/shared';
import { z } from 'zod';
import { prisma } from '../db.js';
import { correoActivo, env } from '../env.js';
import { abrirSesion, estadoDeSesion } from '../lib/acceso.js';
import { auditar } from '../lib/auditoria.js';
import { correoEnlaceAcceso, enviarCorreo } from '../lib/correo.js';
import { urlEnCuenta } from '../lib/enlaces.js';
import { HttpError } from '../lib/errores.js';
import { Freno } from '../lib/freno.js';
import { hashDeRelleno, hashPassword, verifyPassword } from '../lib/password.js';
import { leer } from '../lib/validar.js';
import { borrarCookieSesion, cerrarSesiones, COOKIE_SESION, hashToken } from '../lib/sesion.js';
import { exigirUsuario } from '../plugins/contexto.js';
const VIGENCIA_ENLACE_MIN = 20;
const VENTANA = 15 * 60 * 1000;
// Contraseña: 5 fallos por IP+correo. Enlace: 3 pedidos por correo y 20 por IP.
const frenoPassword = new Freno(5, VENTANA);
const frenoEnlaceCorreo = new Freno(3, VENTANA);
const frenoEnlaceIp = new Freno(20, VENTANA);
const correo = z.string().trim().toLowerCase().email().max(200);
const pedirEnlace = z.object({ email: correo });
const canjear = z.object({ token: z.string().min(20).max(200) });
const entrar = z.object({ email: correo, password: z.string().min(1).max(200) });
const cambiarPassword = z.object({
    actual: z.string().max(200).optional(),
    nueva: z.string().min(MIN_LARGO_PASSWORD, `Mínimo ${MIN_LARGO_PASSWORD} caracteres.`).max(200),
});
/** A dónde apunta el enlace del correo: a la cuenta desde la que se pidió, si existe. */
function urlParaEnlace(req, token) {
    const cuenta = req.cuenta && !req.cuenta.cerrada ? req.cuenta : null;
    return urlEnCuenta(req.server.config.baseDomain, cuenta?.slug ?? null, '/entrar/enlace', { token });
}
export default async function rutasAuth(app) {
    /** Pide un enlace mágico. Responde lo mismo exista o no el correo: no revela quién tiene cuenta. */
    app.post('/api/v1/auth/enlace', async (req) => {
        // Sin correo saliente (MVP: los correos llegan después) no hay a dónde mandar el enlace.
        if (!correoActivo() && env.isProd)
            throw new HttpError(503, 'El acceso por correo todavía no está disponible.');
        const { email } = leer(pedirEnlace, req.body);
        const respuesta = { ok: true, mensaje: 'Si el correo tiene acceso, te llegará un enlace en unos segundos.' };
        if (frenoEnlaceIp.bloqueado(req.ip) || frenoEnlaceCorreo.bloqueado(email))
            return respuesta;
        frenoEnlaceIp.anotar(req.ip);
        frenoEnlaceCorreo.anotar(email);
        const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
        if (!user)
            return respuesta;
        const token = randomBytes(32).toString('base64url');
        await prisma.loginToken.create({
            data: {
                userId: user.id,
                tokenHash: hashToken(token),
                expiresAt: new Date(Date.now() + VIGENCIA_ENLACE_MIN * 60 * 1000),
            },
        });
        await enviarCorreo({ to: user.email, ...correoEnlaceAcceso(urlParaEnlace(req, token), user.name) });
        return respuesta;
    });
    /** Canjea el token del enlace por una sesión. Un solo uso. */
    app.post('/api/v1/auth/canjear', async (req, reply) => {
        const { token } = leer(canjear, req.body);
        // Marcar como usado en el mismo paso que se valida: dos canjes simultáneos no abren dos sesiones.
        const usado = await prisma.loginToken.updateMany({
            where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: new Date() } },
            data: { usedAt: new Date() },
        });
        if (usado.count !== 1)
            throw new HttpError(401, 'El enlace venció o ya se usó. Pide uno nuevo.');
        const registro = await prisma.loginToken.findUniqueOrThrow({
            where: { tokenHash: hashToken(token) },
            select: { user: { select: { id: true, email: true, name: true } } },
        });
        return abrirSesion(req, reply, registro.user, 'enlace');
    });
    /**
     * Correo y contraseña. Un solo mensaje para correo inexistente, sin contraseña o contraseña
     * errada, y el mismo tiempo de respuesta (hash de relleno): no revela qué correos existen.
     */
    app.post('/api/v1/auth/entrar', async (req, reply) => {
        const { email, password } = leer(entrar, req.body);
        const clave = `${req.ip}|${email}`;
        if (frenoPassword.bloqueado(clave)) {
            throw new HttpError(429, 'Demasiados intentos. Espera 15 minutos e intenta de nuevo.');
        }
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, name: true, passwordHash: true },
        });
        const ok = await verifyPassword(password, user?.passwordHash ?? (await hashDeRelleno()));
        if (!user?.passwordHash || !ok) {
            frenoPassword.anotar(clave);
            await auditar({ userId: user?.id, action: 'user.login_fallido', ip: req.ip, meta: { email } });
            throw new HttpError(401, 'Correo o contraseña incorrectos.');
        }
        frenoPassword.limpiar(clave);
        return abrirSesion(req, reply, user, 'password');
    });
    /** Quién soy y a qué cuentas puedo entrar. 401 si no hay sesión. */
    app.get('/api/v1/auth/sesion', async (req) => estadoDeSesion(exigirUsuario(req).id));
    /** Cierra esta sesión (borra la fila: la cookie robada deja de servir). */
    app.post('/api/v1/auth/salir', async (req, reply) => {
        const token = req.cookies?.[COOKIE_SESION];
        if (token)
            await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
        borrarCookieSesion(reply, req.server.config.baseDomain);
        return { ok: true };
    });
    /** Define o cambia la contraseña propia. Cierra las demás sesiones; esta sigue. */
    app.post('/api/v1/auth/password', async (req) => {
        const usuario = exigirUsuario(req);
        const { actual, nueva } = leer(cambiarPassword, req.body);
        const user = await prisma.user.findUniqueOrThrow({ where: { id: usuario.id }, select: { passwordHash: true } });
        if (user.passwordHash && !(await verifyPassword(actual ?? '', user.passwordHash))) {
            throw new HttpError(403, 'La contraseña actual no es correcta.');
        }
        await prisma.user.update({
            where: { id: usuario.id },
            data: { passwordHash: await hashPassword(nueva), passwordChangedAt: new Date() },
        });
        await cerrarSesiones(usuario.id, usuario.sessionId);
        await auditar({ userId: usuario.id, action: 'user.password', ip: req.ip });
        return { ok: true };
    });
}
