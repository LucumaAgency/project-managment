import path from 'node:path';
import { fileURLToPath } from 'node:url';
// El .env se carga con ruta explícita (relativa a este archivo, no al cwd): el worker lo
// lanza un cron que no corre necesariamente desde la raíz. Las variables ya presentes en el
// entorno ganan sobre el archivo, así que en el servidor manda el panel.
const aqui = path.dirname(fileURLToPath(import.meta.url));
try {
    process.loadEnvFile(path.resolve(aqui, '../../../.env'));
}
catch {
    /* sin .env: solo variables del entorno */
}
const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';
function req(nombre) {
    const v = process.env[nombre];
    if (!v)
        throw new Error(`Falta la variable de entorno ${nombre}`);
    return v;
}
/** En producción no acepta el valor de desarrollo: un secreto público que llega a producción no rompe nada visible. */
function reqEnProduccion(nombre, dev) {
    const v = process.env[nombre];
    if (v)
        return v;
    if (isProd)
        throw new Error(`Falta ${nombre}: es obligatoria con NODE_ENV=production.`);
    return dev;
}
export const env = {
    nodeEnv,
    isProd,
    port: Number(process.env.PORT ?? 3100),
    databaseUrl: req('DATABASE_URL'),
    databaseAdminUrl: req('DATABASE_ADMIN_URL'),
    appUrl: reqEnProduccion('APP_URL', 'http://localhost:5174'),
    sessionSecret: reqEnProduccion('SESSION_SECRET', 'dev-no-usar-en-produccion'),
    /** <slug>.baseDomain = una cuenta. Vacío en local: la cuenta se elige con ?cuenta=slug. */
    baseDomain: process.env.BASE_DOMAIN?.trim().toLowerCase() || '',
    /** Correo saliente (Brevo por SMTP). Sin SMTP_HOST, en desarrollo se imprime en consola. */
    smtp: {
        host: process.env.SMTP_HOST?.trim() || '',
        port: Number(process.env.SMTP_PORT ?? 587),
        user: process.env.SMTP_USER?.trim() || '',
        pass: process.env.SMTP_PASS ?? '',
    },
    mailFrom: process.env.MAIL_FROM?.trim() || 'Lucuma Proyectos <no-reply@localhost>',
    /**
     * Beta: el personal de soporte de Lucuma (users.isStaff) entra a cualquier cuenta como
     * administrador, sin ser miembro, y queda en el registro de auditoría. Encendido salvo
     * SOPORTE_BETA=0. Se apaga al salir de la beta (ver documentacion/03-ARQUITECTURA.md).
     */
    soporteBeta: process.env.SOPORTE_BETA !== '0',
};
/** Hay correo saliente de verdad. Sin él, la web oculta el acceso por enlace al correo. */
export const correoActivo = () => !!env.smtp.host;
