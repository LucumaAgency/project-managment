export declare const env: {
    nodeEnv: string;
    isProd: boolean;
    port: number;
    databaseUrl: string;
    databaseAdminUrl: string;
    appUrl: string;
    sessionSecret: string;
    /** <slug>.baseDomain = una cuenta. Vacío en local: la cuenta se elige con ?cuenta=slug. */
    baseDomain: string;
    /** Correo saliente (Brevo por SMTP). Sin SMTP_HOST, en desarrollo se imprime en consola. */
    smtp: {
        host: string;
        port: number;
        user: string;
        pass: string;
    };
    mailFrom: string;
    /**
     * Beta: el personal de soporte de Lucuma (users.isStaff) entra a cualquier cuenta como
     * administrador, sin ser miembro, y queda en el registro de auditoría. Encendido salvo
     * SOPORTE_BETA=0. Se apaga al salir de la beta (ver documentacion/03-ARQUITECTURA.md).
     */
    soporteBeta: boolean;
    /**
     * Archivos subidos (D-46): en el disco del servidor, FUERA del docroot (public/). Por defecto
     * <raíz>/privados/archivos. nginx no los publica: solo la API los entrega, a quien puede verlos.
     */
    archivosDir: string;
    /** Tamaño máximo de un archivo, en MB. nginx de Plesk tiene su propio tope (client_max_body_size). */
    /** Clave del latido externo (/api/v1/cron/latido). Sin ella, el latido responde 503. */
    cronToken: string;
    archivosMaxBytes: number;
};
/** Hay correo saliente de verdad. Sin él, la web oculta el acceso por enlace al correo. */
export declare const correoActivo: () => boolean;
