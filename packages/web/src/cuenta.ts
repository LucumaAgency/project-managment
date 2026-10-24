import { cuentaLocal, type Config } from './api';

/** Slug de la cuenta en la que está la página, o null si está en la raíz. */
export function cuentaActual(config: Config): string | null {
  if (!config.baseDomain) return cuentaLocal();
  const host = window.location.hostname.toLowerCase();
  const sufijo = '.' + config.baseDomain;
  if (!host.endsWith(sufijo)) return null;
  const sub = host.slice(0, -sufijo.length);
  return sub && !sub.includes('.') && sub !== 'www' ? sub : null;
}

/** Lleva a la portada de una cuenta (otro subdominio en producción, ?cuenta= en local). */
export function irACuenta(config: Config, slug: string) {
  if (config.baseDomain) {
    const puerto = window.location.port ? `:${window.location.port}` : '';
    window.location.href = `${window.location.protocol}//${slug}.${config.baseDomain}${puerto}/`;
  } else {
    window.location.href = `/?cuenta=${encodeURIComponent(slug)}`;
  }
}

/** Lleva a la raíz (selector de cuentas). */
export function irARaiz(config: Config, ruta = '/cuentas') {
  if (config.baseDomain) {
    const puerto = window.location.port ? `:${window.location.port}` : '';
    window.location.href = `${window.location.protocol}//${config.baseDomain}${puerto}${ruta}`;
  } else {
    window.location.href = ruta;
  }
}
