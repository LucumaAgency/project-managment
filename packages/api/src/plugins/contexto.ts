import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Rol } from '@lucuma-pm/shared';
import { conCuenta, type Contexto } from '../lib/contexto.js';
import { cuentaPorSlug, type CuentaResuelta } from '../lib/cuenta.js';
import { HttpError } from '../lib/errores.js';
import { destinoDesdeHost } from '../lib/host.js';
import { COOKIE_SESION, usuarioDeSesion, type UsuarioSesion } from '../lib/sesion.js';

export interface MiembroResuelto {
  id: string;
  role: Rol;
  activo: boolean;
}

declare module 'fastify' {
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
export function registrarContexto(app: FastifyInstance, baseDomain: string) {
  app.decorateRequest('slugPedido', null);
  app.decorateRequest('cuenta', null);
  app.decorateRequest('usuario', null);
  app.decorateRequest('miembro', null);

  app.addHook('onRequest', async (req) => {
    req.slugPedido = slugDePeticion(req, baseDomain);
    const [cuenta, usuario] = await Promise.all([
      req.slugPedido ? cuentaPorSlug(req.slugPedido) : null,
      usuarioDeSesion(req.cookies?.[COOKIE_SESION]),
    ]);
    req.cuenta = cuenta;
    req.usuario = usuario;

    if (cuenta && usuario && !cuenta.cerrada) {
      // La membresía también pasa por RLS: se lee con la cuenta ya fijada.
      const m = await conCuenta({ accountId: cuenta.id, userId: usuario.id }, (tx) =>
        tx.membership.findUnique({
          where: { accountId_userId: { accountId: cuenta.id, userId: usuario.id } },
          select: { id: true, role: true, status: true },
        })
      );
      req.miembro = m ? { id: m.id, role: m.role, activo: m.status === 'active' } : null;
    }
  });
}

function slugDePeticion(req: FastifyRequest, baseDomain: string): string | null {
  if (baseDomain) {
    const destino = destinoDesdeHost(req.headers.host, baseDomain);
    return destino.tipo === 'cuenta' ? destino.slug : null;
  }
  const query = (req.query as Record<string, unknown> | undefined)?.cuenta;
  const valor = typeof query === 'string' ? query : req.headers['x-cuenta'];
  return typeof valor === 'string' && valor.trim() ? valor.trim().toLowerCase() : null;
}

/** La ruta necesita sesión, aunque no haya cuenta (p. ej. el selector de cuentas). */
export function exigirUsuario(req: FastifyRequest): UsuarioSesion {
  if (!req.usuario) throw new HttpError(401, 'Inicia sesión.');
  return req.usuario;
}

export interface Acceso {
  ctx: Contexto;
  rol: Rol;
  cuenta: CuentaResuelta;
  usuario: UsuarioSesion;
}

/**
 * La ruta trabaja dentro de una cuenta: exige que exista, esté abierta, haya sesión y la
 * persona sea miembro activo. Devuelve el `ctx` que se pasa a `conCuenta`.
 *
 * Soporte de Lucuma (`isStaff`) todavía no entra sin membresía: llega con el superadmin.
 */
export function exigirCuenta(req: FastifyRequest): Acceso {
  if (!req.slugPedido) throw new HttpError(400, 'Falta la cuenta.');
  if (!req.cuenta) throw new HttpError(404, 'Esa cuenta no existe.');
  if (req.cuenta.cerrada) throw new HttpError(410, 'Esta cuenta fue cerrada.');
  const usuario = exigirUsuario(req);
  if (!req.miembro || !req.miembro.activo) throw new HttpError(403, 'No tienes acceso a esta cuenta.');
  return {
    ctx: { accountId: req.cuenta.id, userId: usuario.id },
    rol: req.miembro.role,
    cuenta: req.cuenta,
    usuario,
  };
}
