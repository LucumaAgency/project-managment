import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../db.js';

export const COOKIE_SESION = 'pm_sesion';
const DURACION_DIAS = 30;

/** En la base solo se guarda el hash: quien lea la tabla no puede usar las sesiones. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

/** Crea una sesión y devuelve el token para la cookie. `sessions` no tiene RLS (es previa a la cuenta). */
export async function crearSesion(userId: string, meta: { userAgent?: string; ip?: string } = {}) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + DURACION_DIAS * 24 * 60 * 60 * 1000);
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

/** Usuario dueño del token, si la sesión existe y no venció. */
export async function usuarioDeSesion(token: string | undefined): Promise<UsuarioSesion | null> {
  if (!token) return null;
  const sesion = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true, isStaff: true } } },
  });
  if (!sesion || sesion.expiresAt <= new Date()) return null;
  return { ...sesion.user, sessionId: sesion.id };
}
