/**
 * Subdominios que no pueden ser el slug de una cuenta: los usa la plataforma.
 * Se valida al crear la cuenta (día 4) y al resolver el host.
 */
export declare const SLUGS_RESERVADOS: Set<string>;
/** Formato del slug: minúsculas, números y guiones, 2 a 40, sin guion al inicio ni al final. */
export declare const SLUG_VALIDO: RegExp;
export declare function slugValido(slug: string): boolean;
/** Largo mínimo de contraseña (API y web). */
export declare const MIN_LARGO_PASSWORD = 10;
