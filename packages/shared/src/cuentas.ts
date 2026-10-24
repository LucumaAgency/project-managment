/**
 * Subdominios que no pueden ser el slug de una cuenta: los usa la plataforma.
 * Se valida al crear la cuenta (día 4) y al resolver el host.
 */
export const SLUGS_RESERVADOS = new Set([
  'www', 'app', 'api', 'admin', 'soporte', 'ayuda', 'help', 'status', 'mail', 'correo',
  'static', 'cdn', 'assets', 'login', 'registro', 'cuentas', 'blog', 'docs',
]);

/** Formato del slug: minúsculas, números y guiones, 2 a 40, sin guion al inicio ni al final. */
export const SLUG_VALIDO = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export function slugValido(slug: string): boolean {
  return SLUG_VALIDO.test(slug) && !SLUGS_RESERVADOS.has(slug);
}

/** Largo mínimo de contraseña (API y web). */
export const MIN_LARGO_PASSWORD = 10;
