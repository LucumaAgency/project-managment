export interface Correo {
    to: string;
    subject: string;
    html: string;
    text: string;
}
/** En tests los correos no salen: quedan aquí para que el test los lea (enlace mágico, etc.). */
export declare const buzonDePrueba: Correo[];
/**
 * Envía un correo. Tres modos:
 *  - test: lo guarda en `buzonDePrueba`.
 *  - sin SMTP_HOST (desarrollo): lo imprime en consola con sus enlaces, para poder entrar.
 *  - con SMTP: lo envía (Brevo).
 *
 * Por ahora se envía en la misma petición. Cuando exista el worker (semana 3), los correos
 * que no sean de acceso pasan por la cola.
 */
export declare function enviarCorreo(c: Correo): Promise<void>;
export declare function escaparHtml(s: string): string;
export declare function correoEnlaceAcceso(url: string, nombre: string): Omit<Correo, 'to'>;
