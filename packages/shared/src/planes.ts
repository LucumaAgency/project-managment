/**
 * Planes y límites. En el MVP todas las cuentas son `interno` (sin límites); el resto existe
 * para que cobrar después sea configurar, no programar. Account.limits sobrescribe por cuenta.
 */
export type Funcion = 'clientes' | 'exportar' | 'busqueda';

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

/** Plan efectivo de una cuenta: el del catálogo con las excepciones de Account.limits encima. */
export function planDe(plan: string, limites?: LimitesCuenta | null): Plan {
  const base = PLANES[plan] ?? PLANES.prueba;
  return { ...base, ...(limites ?? {}) };
}

export function puedeUsar(plan: Plan, funcion: Funcion): boolean {
  return plan.funciones.includes(funcion);
}

/** true si agregar `nuevos` a `actuales` sigue dentro del límite. */
export function dentroDelLimite(limite: number | null, actuales: number, nuevos = 1): boolean {
  return limite === null || actuales + nuevos <= limite;
}
