import { HttpError } from './errores.js';
/** Valida el cuerpo o la query con zod; el primer error sale como 400 con su mensaje. */
export function leer(esquema, datos) {
    const r = esquema.safeParse(datos);
    if (!r.success)
        throw new HttpError(400, r.error.issues[0]?.message ?? 'Datos inválidos.');
    return r.data;
}
