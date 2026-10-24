import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Un Postgres temporal para toda la corrida, con las migraciones reales aplicadas.
    globalSetup: ['./test/global-setup.ts'],
    // Apunta la app a ese Postgres antes de que cualquier test importe env.ts / db.ts.
    setupFiles: ['./test/setup-env.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
