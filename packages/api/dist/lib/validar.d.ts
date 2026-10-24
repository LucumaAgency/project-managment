import type { z } from 'zod';
/** Valida el cuerpo o la query con zod; el primer error sale como 400 con su mensaje. */
export declare function leer<T>(esquema: z.ZodType<T>, datos: unknown): T;
