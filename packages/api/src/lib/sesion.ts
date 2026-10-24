import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import { prisma } from '../db.js';
import { env } from '../env.js';

export const COOKIE_SESION = 'pm_sesion';
export const DURACION_SESION_DIAS = 30;

/** En la base solo se guarda el hash: quien lea la tabla no puede usar las sesiones. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

/** Crea una sesión y devuelve el token para la cookie. `sessions` no tiene RLS (es previa a la cuenta). */
export async function crearSesion(userId: string, meta: { userAgent?: string; ip?: string } = {}) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + DURACION_SESION_DIAS * 24 * 60 * 60 * 1000); // se renueva con el uso
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt, userAgent: meta.userAgent, ip: meta.ip },
  });
  return { token, expiresAt };
}

export interface UsuarioSesion {
  id: string;
  email: string;
  name: string;
  isStaff: boolean;
  sessionId: string;
}

/**
 * La sesión se renueva con el uso: vence tras 30 días SIN entrar, no 30 días desde el login.
 * Para no escribir en la base en cada petición, se renueva como mucho una vez al día.
 */
const UN_DIA = 24 * 60 * 60 * 1000;
const DURACION_MS = DURACION_SESION_DIAS * UN_DIA;

/**
 * Usuario dueño del token, si la sesión existe y no venció. Si toca renovarla, corre el
 * vencimiento a 30 días desde ahora y devuelve `renovadaHasta` (hay que reponer la cookie).
 */
export async function usuarioDeSesion(
  token: string | undefined
): Promise<(UsuarioSesion & { renovadaHasta: Date | null }) | null> {
  if (!token) return null;
  const sesion = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true, isStaff: true } } },
  });
  const ahora = Date.now();
  if (!sesion || sesion.expiresAt.getTime() <= ahora) return null;

  let renovadaHasta: Date | null = null;
  if (sesion.expiresAt.getTime() < ahora + DURACION_MS - UN_DIA) {
    renovadaHasta = new Date(ahora + DURACION_MS);
    await prisma.session.update({ where: { id: sesion.id }, data: { expiresAt: renovadaHasta, lastSeenAt: new Date(ahora) } });
  }
  return { ...sesion.user, sessionId: sesion.id, renovadaHasta };
}

/**
 * Cookie de sesión. Con dominio base va a `.app.com`: una sola sesión sirve para todas las
 * cuentas de la persona (cambiar de cuenta no pide entrar de nuevo). HttpOnly (el JS de la
 * página no la lee) y SameSite=Lax (no viaja en POST desde otros sitios).
 */
export function ponerCookieSesion(reply: FastifyReply, token: string, expira: Date, baseDomain: string) {
  reply.setCookie(COOKIE_SESION, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    expires: expira,
    ...(baseDomain ? { domain: '.' + baseDomain } : {}),
  });
}

export function borrarCookieSesion(reply: FastifyReply, baseDomain: string) {
  reply.clearCookie(COOKIE_SESION, { path: '/', ...(baseDomain ? { domain: '.' + baseDomain } : {}) });
}

/** Cierra sesiones del usuario. Con `salvo`, conserva esa (cambio de contraseña sin echarte). */
export async function cerrarSesiones(userId: string, salvo?: string) {
  await prisma.session.deleteMany({ where: { userId, ...(salvo ? { id: { not: salvo } } : {}) } });
}
