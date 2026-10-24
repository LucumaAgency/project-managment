import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

/**
 * Dos conexiones, a propósito:
 *
 *  - `prisma`: rol pm_app. Es la ÚNICA que usan las rutas. Row Level Security aplica a
 *    todas sus consultas: sin cuenta fijada en la transacción, no ve ninguna fila.
 *  - `prismaAdmin`: rol pm_admin (BYPASSRLS). Solo para el worker cuando recorre varias
 *    cuentas (resumen diario, purgas), los scripts de consola y el superadmin. Nunca se
 *    importa desde una ruta de usuario.
 */
export const prisma = new PrismaClient({
  datasourceUrl: env.databaseUrl,
  log: ['warn', 'error'],
});

export const prismaAdmin = new PrismaClient({
  datasourceUrl: env.databaseAdminUrl,
  log: ['warn', 'error'],
});
