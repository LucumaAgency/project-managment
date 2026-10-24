import { SLUGS_RESERVADOS } from '@lucuma-pm/shared';
/**
 * De qué cuenta es una petición según el host, con `baseDomain` = "app.com".
 * Función pura: no consulta la base (si el slug existe lo decide quien la llama).
 */
export function destinoDesdeHost(hostCrudo, baseDomain) {
    const host = (hostCrudo ?? '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
    const base = baseDomain.trim().toLowerCase();
    if (!host || !base)
        return { tipo: 'ajeno' };
    if (host === base)
        return { tipo: 'raiz' };
    if (!host.endsWith('.' + base))
        return { tipo: 'ajeno' };
    const sub = host.slice(0, -(base.length + 1));
    if (sub.includes('.'))
        return { tipo: 'ajeno' };
    if (SLUGS_RESERVADOS.has(sub))
        return { tipo: 'raiz' };
    return { tipo: 'cuenta', slug: sub };
}
