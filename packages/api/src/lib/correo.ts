import nodemailer from 'nodemailer';
import { env } from '../env.js';

export interface Correo {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** En tests los correos no salen: quedan aquí para que el test los lea (enlace mágico, etc.). */
export const buzonDePrueba: Correo[] = [];

let transporte: nodemailer.Transporter | null = null;

function obtenerTransporte() {
  transporte ??= nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
  return transporte;
}

/**
 * Envía un correo. Tres modos:
 *  - test: lo guarda en `buzonDePrueba`.
 *  - sin SMTP_HOST (desarrollo): lo imprime en consola con sus enlaces, para poder entrar.
 *  - con SMTP: lo envía (Brevo).
 *
 * Por ahora se envía en la misma petición. Cuando exista el worker (semana 3), los correos
 * que no sean de acceso pasan por la cola.
 */
export async function enviarCorreo(c: Correo) {
  if (env.nodeEnv === 'test') {
    buzonDePrueba.push(c);
    return;
  }
  if (!env.smtp.host) {
    if (env.isProd) throw new Error('Falta SMTP_HOST: en producción el correo es obligatorio.');
    const enlaces = [...c.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    console.log(`[correo:dev] ${c.subject} → ${c.to}`);
    for (const e of enlaces) console.log(`[correo:dev] enlace: ${e}`);
    return;
  }
  await obtenerTransporte().sendMail({ from: env.mailFrom, ...c });
}

export function escaparHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

export function correoEnlaceAcceso(url: string, nombre: string): Omit<Correo, 'to'> {
  return {
    subject: 'Tu enlace de acceso',
    html: `<p>Hola ${escaparHtml(nombre)}:</p>
<p>Entra con este enlace. Vence en 20 minutos y sirve una sola vez.</p>
<p><a href="${url}" style="background:#174FCA;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Entrar</a></p>
<p style="color:#666;font-size:13px">Si no pediste este acceso, ignora este correo: nadie puede entrar sin él.</p>`,
    text: `Entra con este enlace (vence en 20 minutos, sirve una vez): ${url}`,
  };
}
