import { env } from '../env.js';

/**
 * URL absoluta dentro de una cuenta (o en la raíz si `slug` es null), para enlaces que se
 * comparten: acceso por correo, invitaciones. Se arma SOLO con valores configurados (dominio
 * base o APP_URL), nunca con el Host de la petición: si no, alguien con un Host falso
 * podría hacer que el enlace de otra persona apunte a su sitio.
 *
 *  - Con dominio base: https://<slug>.<base><ruta>
 *  - Local (sin dominio base): APP_URL<ruta> con `cuenta=<slug>` en la query.
 */
export function urlEnCuenta(baseDomain: string, slug: string | null, ruta: string, query: Record<string, string> = {}) {
  const params = new URLSearchParams(query);
  if (baseDomain) {
    const host = slug ? `${slug}.${baseDomain}` : baseDomain;
    const q = params.toString();
    return `https://${host}${ruta}${q ? `?${q}` : ''}`;
  }
  if (slug) params.set('cuenta', slug);
  const q = params.toString();
  return `${env.appUrl}${ruta}${q ? `?${q}` : ''}`;
}
