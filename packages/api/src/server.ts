import { buildApp } from './app.js';
import { env } from './env.js';

// Sin top-level await: el arranque vive en main() (lección del CRM con Passenger).
async function main() {
  const app = await buildApp();
  await app.listen({ port: env.port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error('No se pudo arrancar la API:', err);
  process.exit(1);
});
