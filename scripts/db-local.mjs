// Postgres 16 local para desarrollo, sin instalar nada en el sistema.
//
//   npm run db:local        (dejarlo corriendo en otra terminal; Ctrl+C lo apaga)
//
// Datos en .pgdata/ (fuera de git). La primera vez crea los roles pm_admin y pm_app y la base.
// En producción los roles se crean a mano con contraseñas reales (documentacion/08-DESARROLLO.md).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { levantarPostgres } from './pg-embebido.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const puerto = Number(process.env.PG_LOCAL_PORT ?? 5433);
const base = 'lucuma_pm';

const pg = await levantarPostgres({ dataDir: path.join(raiz, '.pgdata'), puerto, base });
console.log(`Postgres local en localhost:${puerto} (base ${base}). Ctrl+C para apagar.`);

const apagar = async () => {
  await pg.detener();
  process.exit(0);
};
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
// Mantener el proceso vivo mientras Postgres corre.
setInterval(() => {}, 1 << 30);
