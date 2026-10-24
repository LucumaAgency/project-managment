/**
 * Crea los recordatorios pendientes de todas las cuentas, a mano (Plesk → Run script):
 *   npm run recordatorios:prod
 * Es lo mismo que hace el latido externo. Se puede correr las veces que se quiera: un
 * recordatorio ya creado no se repite.
 */
import { prisma, prismaAdmin } from '../db.js';
import { recordatoriosDeTodas } from '../services/recordatorios.js';

recordatoriosDeTodas()
  .then((r) => console.log(`Recordatorios: ${r.avisos} avisos nuevos en ${r.cuentas} cuentas.`))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]));
