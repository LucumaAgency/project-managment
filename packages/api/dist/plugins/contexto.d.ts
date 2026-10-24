import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Rol } from '@lucuma-pm/shared';
import { type Contexto } from '../lib/contexto.js';
import { type CuentaResuelta } from '../lib/cuenta.js';
import { type UsuarioSesion } from '../lib/sesion.js';
export interface ConfigApp {
    baseDomain: string;
    /** Beta: soporte de Lucuma (isStaff) entra a cualquier cuenta como admin. */
    soporteBeta: boolean;
}
export interface MiembroResuelto {
    id: string;
    role: Rol;
    activo: boolean;
}
declare module 'fastify' {
    interface FastifyInstance {
        config: ConfigApp;
    }
    interface FastifyRequest {
        /** Slug pedido (subdominio, o `?cuenta=` / `X-Cuenta` en local). Null = sin cuenta. */
        slugPedido: string | null;
        /** La cuenta del slug, si existe. */
        cuenta: CuentaResuelta | null;
        /** Dueño de la cookie de sesión, si es válida. */
        usuario: UsuarioSesion | null;
        /** Su membresía en `cuenta`, si la tiene. */
        miembro: MiembroResuelto | null;
    }
}
/**
 * En cada petición averigua cuenta, usuario y membresía. No corta nada: solo deja los datos
 * en `req`. Cada ruta decide qué exige con `exigirCuenta` / `exigirUsuario`.
 *
 * De dónde sale la cuenta:
 *  - Con `baseDomain` (producción): del subdominio. `?cuenta=` y `X-Cuenta` se ignoran.
 *  - Sin `baseDomain` (local y tests): de `?cuenta=slug` o del encabezado `X-Cuenta`.
 */
export declare function registrarContexto(app: FastifyInstance, config: ConfigApp): void;
/** La ruta necesita sesión, aunque no haya cuenta (p. ej. el selector de cuentas). */
export declare function exigirUsuario(req: FastifyRequest): UsuarioSesion;
export interface Acceso {
    ctx: Contexto;
    rol: Rol;
    cuenta: CuentaResuelta;
    usuario: UsuarioSesion;
    /** Entró como soporte de Lucuma, sin ser miembro (beta). Actúa como admin. */
    soporte: boolean;
}
/**
 * La ruta trabaja dentro de una cuenta: exige que exista, esté abierta, haya sesión y la
 * persona sea miembro activo. Devuelve el `ctx` que se pasa a `conCuenta`.
 *
 * Soporte de Lucuma (`isStaff`), durante la beta, entra sin membresía con rol de admin.
 * Fuera de la beta (`SOPORTE_BETA=0`) necesita ser miembro como cualquiera.
 */
export declare function exigirCuenta(req: FastifyRequest): Acceso;
