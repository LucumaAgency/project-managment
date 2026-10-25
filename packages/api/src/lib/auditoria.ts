import { prisma } from '../db.js';
import type { Tx } from './contexto.js';

/**
 * Registro de seguridad (logins, cambios de contraseña, invitaciones, roles).
 *
 * `createMany` y no `create`: `create` pide la fila de vuelta (RETURNING) y una fila con
 * accountId null no es visible para pm_app, así que Postgres rechazaría el insert. Con la
 * cuenta fijada se pasa el `tx` de `conCuenta`.
 */
export async function auditar(
  datos: { accountId?: string | null; userId?: string | null; action: string; entity?: string; entityId?: string; ip?: string; meta?: object },
  tx?: Tx
) {
  await (tx ?? prisma).auditLog.createMany({
    data: [
      {
        accountId: datos.accountId ?? null,
        userId: datos.userId ?? null,
        action: datos.action,
        entity: datos.entity,
        entityId: datos.entityId,
        ip: datos.ip,
        meta: datos.meta,
      },
    ],
  });
}
