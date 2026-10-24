import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

export type Tx = Prisma.TransactionClient;

/** Quién hace la petición y en qué cuenta. Lo arma el hook de plugins/contexto.ts. */
export interface Contexto {
  accountId: string;
  userId: string;
}

// Una petición de la app no debería tardar más que esto con la conexión tomada.
const OPCIONES_TX = { maxWait: 5_000, timeout: 15_000 } as const;

/**
 * Corre `fn` dentro de una transacción con la cuenta y el usuario fijados.
 *
 * Es la ÚNICA forma en que el código de la app lee o escribe datos de una cuenta. Las
 * políticas RLS comparan `accountId` con `app.account_id`: fuera de esta función, el rol
 * pm_app no ve ninguna fila. `set_config(..., true)` dura solo lo que dura la transacción,
 * así que una conexión del pool nunca arrastra la cuenta de la petición anterior.
 */
export function conCuenta<T>(ctx: Contexto, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.account_id', ${ctx.accountId}, true),
                                set_config('app.user_id', ${ctx.userId}, true)`;
    return fn(tx);
  }, OPCIONES_TX);
}

/**
 * Solo con el usuario fijado, sin cuenta. Para lo que pasa antes de elegir cuenta: el
 * selector de cuentas tras el login. RLS deja ver únicamente las membresías propias.
 */
export function conUsuario<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    return fn(tx);
  }, OPCIONES_TX);
}
