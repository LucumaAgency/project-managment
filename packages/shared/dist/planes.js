const GB = 1024 ** 3;
const TODAS = ['clientes', 'exportar', 'busqueda'];
export const PLANES = {
    interno: { nombre: 'Interno', maxUsuarios: null, maxProyectos: null, maxAlmacenamientoBytes: null, funciones: TODAS },
    prueba: { nombre: 'Prueba', maxUsuarios: 5, maxProyectos: 3, maxAlmacenamientoBytes: 2 * GB, funciones: TODAS },
    estudio: { nombre: 'Estudio', maxUsuarios: 10, maxProyectos: null, maxAlmacenamientoBytes: 50 * GB, funciones: TODAS },
    agencia: { nombre: 'Agencia', maxUsuarios: null, maxProyectos: null, maxAlmacenamientoBytes: 500 * GB, funciones: TODAS },
};
const CLAVES_LIMITE = ['maxUsuarios', 'maxProyectos', 'maxAlmacenamientoBytes'];
/**
 * Plan efectivo de una cuenta: el del catálogo con las excepciones de Account.limits encima.
 * `limites` viene de un campo JSON: solo se toman las claves conocidas con número o null.
 */
export function planDe(plan, limites) {
    const base = PLANES[plan] ?? PLANES.prueba;
    const extra = {};
    if (limites && typeof limites === 'object') {
        for (const k of CLAVES_LIMITE) {
            const v = limites[k];
            if (v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0))
                extra[k] = v;
        }
    }
    return { ...base, ...extra };
}
export function puedeUsar(plan, funcion) {
    return plan.funciones.includes(funcion);
}
/** true si agregar `nuevos` a `actuales` sigue dentro del límite. */
export function dentroDelLimite(limite, actuales, nuevos = 1) {
    return limite === null || actuales + nuevos <= limite;
}
const LIMITE_DE = {
    usuarios: 'maxUsuarios',
    proyectos: 'maxProyectos',
    almacenamiento: 'maxAlmacenamientoBytes',
};
const MOTIVO = {
    usuarios: (n) => `Tu plan permite hasta ${n} personas del equipo (los clientes no cuentan).`,
    proyectos: (n) => `Tu plan permite hasta ${n} proyectos activos.`,
    almacenamiento: (n) => `Tu plan permite hasta ${Math.round(n / GB)} GB de archivos.`,
};
/** El `can()` del plan: ¿esta cuenta puede usar la función o sumar este recurso? */
export function planPermite(plan, consulta) {
    if ('funcion' in consulta) {
        return puedeUsar(plan, consulta.funcion)
            ? { ok: true }
            : { ok: false, motivo: `Tu plan ${plan.nombre} no incluye esta función.` };
    }
    const limite = plan[LIMITE_DE[consulta.recurso]] ?? null;
    return dentroDelLimite(limite, consulta.actuales, consulta.nuevos ?? 1)
        ? { ok: true }
        : { ok: false, motivo: MOTIVO[consulta.recurso](limite) };
}
