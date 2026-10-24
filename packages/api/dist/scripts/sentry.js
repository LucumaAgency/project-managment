/**
 * Prueba de Sentry (Plesk → Run script): npm run sentry:probar:prod
 * Manda un error de prueba con el SENTRY_DSN del .env y dice si Sentry lo recibió.
 */
import { env } from '../env.js';
import { leerDsn, reportar } from '../lib/sentry.js';
async function main() {
    if (!env.sentryDsn)
        return console.log('Falta SENTRY_DSN en el .env: no se manda nada a Sentry.');
    if (!leerDsn(env.sentryDsn))
        return console.log('SENTRY_DSN no tiene la forma https://<clave>@<servidor>/<número>. Cópialo de Sentry → Settings → Client Keys (DSN).');
    const ok = await reportar(new Error('Prueba de Lucuma Proyectos: si ves esto en Sentry, funciona.'), { donde: 'sentry:probar' });
    console.log(ok ? 'Enviado. Debería aparecer en Sentry → Issues en menos de un minuto.' : 'Sentry no lo aceptó o no se pudo conectar (revisa el DSN y que el servidor pueda salir a internet).');
    console.log(env.sentryDsnWeb ? 'La web también reporta (SENTRY_DSN_WEB).' : 'La web no reporta: falta SENTRY_DSN_WEB (opcional).');
}
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
