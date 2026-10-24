/**
 * Carga proyectos desde un archivo JSON (D-61). En Plesk:
 *   1. Subir el archivo a privados/ con el Administrador de archivos (NUNCA al repo: es público).
 *   2. Run script:  cargar:prod -- privados/carga.json --probar   (solo dice qué haría)
 *   3. Run script:  cargar:prod -- privados/carga.json            (carga)
 * Un proyecto que ya existe con el mismo nombre se salta: se puede correr de nuevo sin duplicar.
 * Formato: ver documentacion/10-DESPLIEGUE-PLESK.md §5f.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma, prismaAdmin } from '../db.js';
import { cargar } from '../services/carga.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

async function main() {
  const args = process.argv.slice(2);
  const probar = args.includes('--probar');
  const archivo = args.find((a) => !a.startsWith('--'));
  if (!archivo) {
    console.log('Uso: cargar:prod -- privados/carga.json [--probar]');
    process.exitCode = 1;
    return;
  }
  const ruta = path.isAbsolute(archivo) ? archivo : path.resolve(RAIZ, archivo);
  const datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  const r = await cargar(datos, { probar });
  console.log(probar ? 'PRUEBA (no se guardó nada):' : 'Carga terminada:');
  if (r.creados.length) console.log(`  ${probar ? 'Se crearían' : 'Creados'} (${r.creados.length}): ${r.creados.join(' · ')}`);
  if (r.saltados.length) console.log(`  Ya existían, se saltaron (${r.saltados.length}): ${r.saltados.join(' · ')}`);
  console.log(`  ${r.listas} listas, ${r.tareas} tareas, ${r.mensajes} mensajes.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]));
