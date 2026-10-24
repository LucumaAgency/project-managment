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
    maxUsuarios: number | null;
    maxProyectos: number | null;
    maxAlmacenamientoBytes: number | null;
    funciones: Funcion[];
}
export declare const PLANES: Record<string, Plan>;
export interface LimitesCuenta {
    maxUsuarios?: number | null;
    maxProyectos?: number | null;
    maxAlmacenamientoBytes?: number | null;
}
/**
 * Plan efectivo de una cuenta: el del catálogo con las excepciones de Account.limits encima.
 * `limites` viene de un campo JSON: solo se toman las claves conocidas con número o null.
 */
export declare function planDe(plan: string, limites?: unknown): Plan;
export declare function puedeUsar(plan: Plan, funcion: Funcion): boolean;
/** true si agregar `nuevos` a `actuales` sigue dentro del límite. */
export declare function dentroDelLimite(limite: number | null, actuales: number, nuevos?: number): boolean;
export type Consulta = {
    funcion: Funcion;
} | {
    recurso: Recurso;
    actuales: number;
    nuevos?: number;
};
export type Respuesta = {
    ok: true;
} | {
    ok: false;
    motivo: string;
};
/** El `can()` del plan: ¿esta cuenta puede usar la función o sumar este recurso? */
export declare function planPermite(plan: Plan, consulta: Consulta): Respuesta;
