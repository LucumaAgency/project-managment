import { auditar } from '../lib/auditoria.js';
import { conCuenta } from '../lib/contexto.js';
import { cuentaPorSlug } from '../lib/cuenta.js';
import { HttpError } from '../lib/errores.js';
import { destinoDesdeHost } from '../lib/host.js';
import { COOKIE_SESION, ponerCookieSesion, usuarioDeSesion } from '../lib/sesion.js';
/**
 * En cada petición averigua cuenta, usuario y membresía. No corta nada: solo deja los datos
 * en `req`. Cada ruta decide qué exige con `exigirCuenta` / `exigirUsuario`.
 *
 * De dónde sale la cuenta:
 *  - Con `baseDomain` (producción): del subdominio. `?cuenta=` y `X-Cuenta` se ignoran.
 *  - Sin `baseDomain` (local y tests): de `?cuenta=slug` o del encabezado `X-Cuenta`.
 */
export function registrarContexto(app, config) {
    const { baseDomain } = config;
    app.decorate('config', config);
    app.decorateRequest('slugPedido', null);
    app.decorateRequest('cuenta', null);
    app.decorateRequest('usuario', null);
    app.decorateRequest('miembro', null);
    app.addHook('onRequest', async (req, reply) => {
        req.slugPedido = slugDePeticion(req, baseDomain);
        const [cuenta, usuario] = await Promise.all([
            req.slugPedido ? cuentaPorSlug(req.slugPedido) : null,
            usuarioDeSesion(req.cookies?.[COOKIE_SESION]),
        ]);
        req.cuenta = cuenta;
        if (usuario?.renovadaHasta) {
            // Sesión renovada con el uso: la cookie también corre su vencimiento.
            ponerCookieSesion(reply, req.cookies[COOKIE_SESION], usuario.renovadaHasta, baseDomain);
        }
        if (usuario) {
            const { renovadaHasta: _, ...resto } = usuario;
            req.usuario = resto;
        }
        else {
            req.usuario = null;
        }
        if (cuenta && usuario && !cuenta.cerrada) {
            // La membresía también pasa por RLS: se lee con la cuenta ya fijada.
            const m = await conCuenta({ accountId: cuenta.id, userId: usuario.id }, (tx) => tx.membership.findUnique({
                where: { accountId_userId: { accountId: cuenta.id, userId: usuario.id } },
                select: { id: true, role: true, status: true },
            }));
            req.miembro = m ? { id: m.id, role: m.role, activo: m.status === 'active' } : null;
            if (entraComoSoporte(req, config))
                await anotarAccesoSoporte(req);
        }
    });
}
/** Soporte entra sin membresía activa solo en beta y solo si es staff. */
function entraComoSoporte(req, config) {
    return config.soporteBeta && !!req.usuario?.isStaff && !(req.miembro?.activo ?? false);
}
/**
 * Cada entrada de soporte a una cuenta queda en audit_log de ESA cuenta (la ve su dueño
 * cuando exista la pantalla de seguridad). Una vez por sesión y cuenta, no por petición.
 */
const accesosSoporteAnotados = new Set();
async function anotarAccesoSoporte(req) {
    const clave = `${req.usuario.sessionId}|${req.cuenta.id}`;
    if (accesosSoporteAnotados.has(clave))
        return;
    if (accesosSoporteAnotados.size > 10_000)
        accesosSoporteAnotados.clear();
    accesosSoporteAnotados.add(clave);
    await conCuenta({ accountId: req.cuenta.id, userId: req.usuario.id }, (tx) => auditar({ accountId: req.cuenta.id, userId: req.usuario.id, action: 'soporte.acceso', ip: req.ip }, tx));
}
function slugDePeticion(req, baseDomain) {
    if (baseDomain) {
        const destino = destinoDesdeHost(req.headers.host, baseDomain);
        return destino.tipo === 'cuenta' ? destino.slug : null;
    }
    const query = req.query?.cuenta;
    const valor = typeof query === 'string' ? query : req.headers['x-cuenta'];
    return typeof valor === 'string' && valor.trim() ? valor.trim().toLowerCase() : null;
}
/** La ruta necesita sesión, aunque no haya cuenta (p. ej. el selector de cuentas). */
export function exigirUsuario(req) {
    if (!req.usuario)
        throw new HttpError(401, 'Inicia sesión.');
    return req.usuario;
}
/**
 * La ruta trabaja dentro de una cuenta: exige que exista, esté abierta, haya sesión y la
 * persona sea miembro activo. Devuelve el `ctx` que se pasa a `conCuenta`.
 *
 * Soporte de Lucuma (`isStaff`), durante la beta, entra sin membresía con rol de admin.
 * Fuera de la beta (`SOPORTE_BETA=0`) necesita ser miembro como cualquiera.
 */
export function exigirCuenta(req) {
    if (!req.slugPedido)
        throw new HttpError(400, 'Falta la cuenta.');
    if (!req.cuenta)
        throw new HttpError(404, 'Esa cuenta no existe.');
    if (req.cuenta.cerrada)
        throw new HttpError(410, 'Esta cuenta fue cerrada.');
    const usuario = exigirUsuario(req);
    const ctx = { accountId: req.cuenta.id, userId: usuario.id };
    if (req.miembro?.activo)
        return { ctx, rol: req.miembro.role, cuenta: req.cuenta, usuario, soporte: false };
    if (entraComoSoporte(req, req.server.config))
        return { ctx, rol: 'admin', cuenta: req.cuenta, usuario, soporte: true };
    throw new HttpError(403, 'No tienes acceso a esta cuenta.');
}
