/**
 * Purga la papelera de todas las cuentas a mano (Plesk → Run script):
 *   npm run purgar:prod
 * Borra lo que lleva más de 30 días en la papelera y los archivos que ya nadie usa. Es lo
 * mismo que hace el latido externo cada hora.
 */
import { prisma, prismaAdmin } from '../db.js';
import { purgarTodas } from '../services/purga.js';

purgarTodas(new Date(), (e) => console.error(e))
  .then((r) =>
    console.log(`Purga: ${r.proyectos} proyectos, ${r.elementos} elementos, ${r.archivos} archivos (${(r.bytes / 1024 / 1024).toFixed(1)} MB liberados).`)
  )
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]));
