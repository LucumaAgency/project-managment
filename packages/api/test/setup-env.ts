import { inject } from 'vitest';

// Las variables del entorno ganan sobre el .env (env.ts), así que esto manda.
process.env.DATABASE_URL = inject('urlApp');
process.env.DATABASE_ADMIN_URL = inject('urlAdmin');
process.env.NODE_ENV = 'test';
process.env.BASE_DOMAIN = '';
