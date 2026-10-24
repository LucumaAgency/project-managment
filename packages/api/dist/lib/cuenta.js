import { prisma } from '../db.js';
/**
 * Cuenta por slug. Pasa por la función `cuenta_por_slug` (SECURITY DEFINER) porque la tabla
 * `accounts` está bajo RLS y aún no hay cuenta fijada: es justo lo que se está averiguando.
 */
export async function cuentaPorSlug(slug) {
    const filas = await prisma.$queryRaw `SELECT * FROM cuenta_por_slug(${slug})`;
    return filas[0] ?? null;
}
