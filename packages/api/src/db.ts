import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

/**
 * Dos conexiones, a propósito:
 *
 *  - `prisma`: rol pm_app. Es la ÚNICA que usan las rutas. Row Level Security aplica a
 *    todas sus consultas: sin cuenta fijada en la transacción, no ve ninguna fila.
 *  - `prismaAdmin`: rol pm_admin (dueño de las tablas: no lo frena RLS, D-44). Solo para el worker cuando recorre varias
 *    cuentas (resumen diario, purgas), los scripts de consola y el superadmin. Nunca se
 *    importa desde una ruta de usuario.
 */
// En tests los rechazos de RLS son esperados: no ensuciar la salida con ellos.
const log = env.nodeEnv === 'test' ? (['warn'] as const) : (['warn', 'error'] as const);

export const prisma = new PrismaClient({ datasourceUrl: env.databaseUrl, log: [...log] });

export const prismaAdmin = new PrismaClient({ datasourceUrl: env.databaseAdminUrl, log: [...log] });
