/**
 * Planes y límites. En el MVP todas las cuentas son `interno` (sin límites); el resto existe
 * para que cobrar después sea configurar, no programar. Account.limits sobrescribe por cuenta.
 *
 * Toda pregunta "¿el plan deja hacer esto?" pasa por `planPermite()` (el `can()` del plan):
 * la API la usa para cortar y la web para mostrar el aviso antes de que la persona lo intente.
 */
export type Funcion = 'clientes' | 'exportar' | 'busqueda';
export type Recurso = 'usuarios' | 'proyectos' | 'almacenamiento';

export interface Plan {
  nombre: string;
  maxUsuarios: number | null; // null = sin límite (los clientes invitados no cuentan)
  maxProyectos: number | null;
  maxAlmacenamientoBytes: number | null;
  funciones: Funcion[];
}

const GB = 1024 ** 3;
const TODAS: Funcion[] = ['clientes', 'exportar', 'busqueda'];

export const PLANES: Record<string, Plan> = {
  interno: { nombre: 'Interno', maxUsuarios: null, maxProyectos: null, maxAlmacenamientoBytes: null, funciones: TODAS },
  prueba: { nombre: 'Prueba', maxUsuarios: 5, maxProyectos: 3, maxAlmacenamientoBytes: 2 * GB, funciones: TODAS },
  estudio: { nombre: 'Estudio', maxUsuarios: 10, maxProyectos: null, maxAlmacenamientoBytes: 50 * GB, funciones: TODAS },
  agencia: { nombre: 'Agencia', maxUsuarios: null, maxProyectos: null, maxAlmacenamientoBytes: 500 * GB, funciones: TODAS },
};

export interface LimitesCuenta {
  maxUsuarios?: number | null;
  maxProyectos?: number | null;
  maxAlmacenamientoBytes?: number | null;
}

const CLAVES_LIMITE = ['maxUsuarios', 'maxProyectos', 'maxAlmacenamientoBytes'] as const;

/**
 * Plan efectivo de una cuenta: el del catálogo con las excepciones de Account.limits encima.
 * `limites` viene de un campo JSON: solo se toman las claves conocidas con número o null.
 */
export function planDe(plan: string, limites?: unknown): Plan {
  const base = PLANES[plan] ?? PLANES.prueba;
  const extra: LimitesCuenta = {};
  if (limites && typeof limites === 'object') {
    for (const k of CLAVES_LIMITE) {
      const v = (limites as Record<string, unknown>)[k];
      if (v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0)) extra[k] = v;
    }
  }
  return { ...base, ...extra };
}

export function puedeUsar(plan: Plan, funcion: Funcion): boolean {
  return plan.funciones.includes(funcion);
}

/** true si agregar `nuevos` a `actuales` sigue dentro del límite. */
export function dentroDelLimite(limite: number | null, actuales: number, nuevos = 1): boolean {
  return limite === null || actuales + nuevos <= limite;
}

export type Consulta =
  | { funcion: Funcion }
  | { recurso: Recurso; actuales: number; nuevos?: number };

export type Respuesta = { ok: true } | { ok: false; motivo: string };

const LIMITE_DE: Record<Recurso, keyof LimitesCuenta> = {
  usuarios: 'maxUsuarios',
  proyectos: 'maxProyectos',
  almacenamiento: 'maxAlmacenamientoBytes',
};

const MOTIVO: Record<Recurso, (limite: number) => string> = {
  usuarios: (n) => `Tu plan permite hasta ${n} personas del equipo (los clientes no cuentan).`,
  proyectos: (n) => `Tu plan permite hasta ${n} proyectos activos.`,
  almacenamiento: (n) => `Tu plan permite hasta ${Math.round(n / GB)} GB de archivos.`,
};

/** El `can()` del plan: ¿esta cuenta puede usar la función o sumar este recurso? */
export function planPermite(plan: Plan, consulta: Consulta): Respuesta {
  if ('funcion' in consulta) {
    return puedeUsar(plan, consulta.funcion)
      ? { ok: true }
      : { ok: false, motivo: `Tu plan ${plan.nombre} no incluye esta función.` };
  }
  const limite = plan[LIMITE_DE[consulta.recurso]] ?? null;
  return dentroDelLimite(limite, consulta.actuales, consulta.nuevos ?? 1)
    ? { ok: true }
    : { ok: false, motivo: MOTIVO[consulta.recurso](limite!) };
}
