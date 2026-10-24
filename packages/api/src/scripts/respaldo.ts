/**
 * Respaldo de la base a mano (Plesk → Run script):
 *   npm run respaldo:prod                       hace el respaldo de hoy y lista los que hay
 *   npm run respaldo:prod -- lista              solo lista
 *   npm run respaldo:prod -- restaurar AAAA-MM-DD --confirmo
 *        restaura ese día sobre la base actual (BORRA lo que hay; antes guarda una copia).
 *        Después: Reiniciar la app.
 */
import path from 'node:path';
import { prisma, prismaAdmin } from '../db.js';
import { env } from '../env.js';
import { buscarHerramienta, hacerRespaldo, listarRespaldos, restaurarRespaldo, versionServidor } from '../services/respaldo.js';

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

async function main() {
  const [accion = 'hacer', dia, confirmo] = process.argv.slice(2);
  if (accion === 'restaurar') {
    if (!dia || confirmo !== '--confirmo') {
      console.log('Para restaurar: npm run respaldo:prod -- restaurar AAAA-MM-DD --confirmo  (borra la base actual; antes guarda una copia)');
      process.exitCode = 1;
      return;
    }
    const archivo = path.join(env.respaldosDir, `base-${dia}.dump`);
    const r = await restaurarRespaldo(archivo);
    console.log(`Restaurado ${archivo}.\nCopia de lo que había antes: ${r.copiaPrevia}\nAhora: Reiniciar la app.`);
    return;
  }
  if (accion === 'hacer') {
    const [herramienta, servidor] = await Promise.all([buscarHerramienta('pg_dump'), versionServidor()]);
    console.log(`PostgreSQL del servidor: ${servidor}. pg_dump: ${herramienta ? `${herramienta.version} (${herramienta.ruta})` : 'no encontrado'}.`);
    const r = await hacerRespaldo();
    console.log(`Respaldo hecho: ${r.archivo} (${mb(r.bytes)}, ${r.archivos} archivos en la lista, ${r.ms} ms).`);
  }
  const lista = await listarRespaldos();
  console.log(lista.length ? `Respaldos (${lista.length}):\n${lista.map((x) => `  ${x.dia}  ${mb(x.bytes)}`).join('\n')}` : 'Todavía no hay respaldos.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]));
