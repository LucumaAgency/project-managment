import type { FastifyReply } from 'fastify';
export declare const COOKIE_SESION = "pm_sesion";
export declare const DURACION_SESION_DIAS = 30;
/** En la base solo se guarda el hash: quien lea la tabla no puede usar las sesiones. */
export declare function hashToken(token: string): string;
/** Crea una sesión y devuelve el token para la cookie. `sessions` no tiene RLS (es previa a la cuenta). */
export declare function crearSesion(userId: string, meta?: {
    userAgent?: string;
    ip?: string;
}): Promise<{
    token: string;
    expiresAt: Date;
}>;
export interface UsuarioSesion {
    id: string;
    email: string;
    name: string;
    isStaff: boolean;
    sessionId: string;
}
/**
 * Usuario dueño del token, si la sesión existe y no venció. Si toca renovarla, corre el
 * vencimiento a 30 días desde ahora y devuelve `renovadaHasta` (hay que reponer la cookie).
 */
export declare function usuarioDeSesion(token: string | undefined): Promise<(UsuarioSesion & {
    renovadaHasta: Date | null;
}) | null>;
/**
 * Cookie de sesión. Con dominio base va a `.app.com`: una sola sesión sirve para todas las
 * cuentas de la persona (cambiar de cuenta no pide entrar de nuevo). HttpOnly (el JS de la
 * página no la lee) y SameSite=Lax (no viaja en POST desde otros sitios).
 */
export declare function ponerCookieSesion(reply: FastifyReply, token: string, expira: Date, baseDomain: string): void;
export declare function borrarCookieSesion(reply: FastifyReply, baseDomain: string): void;
/** Cierra sesiones del usuario. Con `salvo`, conserva esa (cambio de contraseña sin echarte). */
export declare function cerrarSesiones(userId: string, salvo?: string): Promise<void>;
