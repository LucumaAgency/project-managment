import type { z } from 'zod';
import { HttpError } from './errores.js';

/** Valida el cuerpo o la query con zod; el primer error sale como 400 con su mensaje. */
export function leer<T>(esquema: z.ZodType<T>, datos: unknown): T {
  const r = esquema.safeParse(datos);
  if (!r.success) throw new HttpError(400, r.error.issues[0]?.message ?? 'Datos inválidos.');
  return r.data;
}
