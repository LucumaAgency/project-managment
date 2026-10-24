import { type Plan } from '@lucuma-pm/shared';
import type { Tx } from './contexto.js';
/** Plan efectivo de la cuenta fijada en `tx` (catálogo + excepciones de Account.limits). */
export declare function planDeCuenta(tx: Tx, accountId: string): Promise<Plan>;
/**
 * Personas que cuentan para el límite de usuarios: equipo activo (no clientes). Con
 * `conPendientes`, suma las invitaciones de equipo vigentes, para que no se pueda pasar el
 * límite invitando de más y esperando a que acepten. `salvoEmail` excluye la invitación que
 * se está reemplazando.
 */
export declare function usuariosEnUso(tx: Tx, accountId: string, opciones?: {
    conPendientes?: boolean;
    salvoEmail?: string;
}): Promise<number>;
/** Corta con 403 y el motivo del plan si sumar `nuevos` personas de equipo pasa el límite. */
export declare function exigirCupoUsuarios(tx: Tx, accountId: string, opciones?: {
    conPendientes?: boolean;
    salvoEmail?: string;
}): Promise<void>;
