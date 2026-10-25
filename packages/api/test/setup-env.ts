import os from 'node:os';
import path from 'node:path';
import { inject } from 'vitest';

// Las variables del entorno ganan sobre el .env (env.ts), así que esto manda.
process.env.DATABASE_URL = inject('urlApp');
process.env.DATABASE_ADMIN_URL = inject('urlAdmin');
process.env.NODE_ENV = 'test';
process.env.BASE_DOMAIN = '';
// Archivos subidos en los tests: carpeta temporal propia de la corrida, tope chico (1 MB).
process.env.ARCHIVOS_DIR = path.join(os.tmpdir(), `pm-test-archivos-${process.pid}`);
process.env.ARCHIVOS_MAX_MB = '1';
// Respaldos de los tests: carpeta temporal. pg_dump real solo si se indica (TEST_PG_BIN_DIR) o
// si el sistema tiene uno igual o más nuevo que el Postgres de los tests.
process.env.RESPALDOS_DIR = path.join(os.tmpdir(), `pm-test-respaldos-${process.pid}`);
if (process.env.TEST_PG_BIN_DIR) process.env.PG_BIN_DIR = process.env.TEST_PG_BIN_DIR;
// Accesos protegidos (D-66): una clave fija solo para los tests.
process.env.ACCESOS_CLAVE = 'a'.repeat(64);
