import type { Tx } from './contexto.js';
/**
 * Registro de seguridad (logins, cambios de contraseña, invitaciones, roles).
 *
 * `createMany` y no `create`: `create` pide la fila de vuelta (RETURNING) y una fila con
 * accountId null no es visible para pm_app, así que Postgres rechazaría el insert. Con la
 * cuenta fijada se pasa el `tx` de `conCuenta`.
 */
export declare function auditar(datos: {
    accountId?: string | null;
    userId?: string | null;
    action: string;
    entity?: string;
    entityId?: string;
    ip?: string;
    meta?: object;
}, tx?: Tx): Promise<void>;
