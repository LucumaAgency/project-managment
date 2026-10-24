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
};
/** Hay correo saliente de verdad. Sin él, la web oculta el acceso por enlace al correo. */
export declare const correoActivo: () => boolean;
