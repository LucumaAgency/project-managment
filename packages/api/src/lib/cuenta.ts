import { prisma } from '../db.js';

export interface CuentaResuelta {
  id: string;
  slug: string;
  name: string;
  plan: string;
  timeZone: string;
  locale: string;
  cerrada: boolean;
}

/**
 * Cuenta por slug. Pasa por la función `cuenta_por_slug` (SECURITY DEFINER) porque la tabla
 * `accounts` está bajo RLS y aún no hay cuenta fijada: es justo lo que se está averiguando.
 */
export async function cuentaPorSlug(slug: string): Promise<CuentaResuelta | null> {
  const filas = await prisma.$queryRaw<CuentaResuelta[]>`SELECT * FROM cuenta_por_slug(${slug})`;
  return filas[0] ?? null;
}
