import { prisma } from '../db.js';
import { auditar } from './auditoria.js';
import { conUsuario } from './contexto.js';
import { crearSesion, ponerCookieSesion } from './sesion.js';
/** Abre sesión (cookie incluida) y devuelve lo que la web necesita tras entrar. */
export async function abrirSesion(req, reply, user, metodo) {
    const { token, expiresAt } = await crearSesion(user.id, { userAgent: req.headers['user-agent'], ip: req.ip });
    ponerCookieSesion(reply, token, expiresAt, req.server.config.baseDomain);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await auditar({ userId: user.id, action: 'user.login', ip: req.ip, meta: { metodo } });
    return estadoDeSesion(user.id);
}
/** Quién eres y a qué cuentas puedes ir (selector tras el login). */
export async function estadoDeSesion(userId) {
    const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, name: true, email: true, passwordHash: true, isStaff: true },
    });
    const cuentas = await conUsuario(userId, (tx) => tx.$queryRaw `SELECT * FROM cuentas_de_usuario()`);
    return {
        usuario: {
            id: user.id,
            name: user.name,
            email: user.email,
            tienePassword: !!user.passwordHash,
            soporte: user.isStaff,
        },
        cuentas,
    };
}
