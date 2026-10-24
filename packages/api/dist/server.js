import { buildApp } from './app.js';
import { env } from './env.js';
import { reportar } from './lib/sentry.js';
// Lo que se escapa de todo lo demás: a Sentry y al log de Passenger.
process.on('unhandledRejection', (e) => {
    console.error('Promesa rechazada sin manejar:', e);
    void reportar(e, { donde: 'unhandledRejection' });
});
// Sin top-level await: el arranque vive en main() (lección del CRM con Passenger).
async function main() {
    const app = await buildApp();
    await app.listen({ port: env.port, host: '0.0.0.0' });
}
main().catch((err) => {
    console.error('No se pudo arrancar la API:', err);
    process.exit(1);
});
