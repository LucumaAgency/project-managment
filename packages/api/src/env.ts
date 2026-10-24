import path from 'node:path';
import { fileURLToPath } from 'node:url';

// El .env se carga con ruta explícita (relativa a este archivo, no al cwd): el worker lo
// lanza un cron que no corre necesariamente desde la raíz. Las variables ya presentes en el
// entorno ganan sobre el archivo, así que en el servidor manda el panel.
const aqui = path.dirname(fileURLToPath(import.meta.url));
const rutaEnv = path.resolve(aqui, '../../../.env');
/** Qué pasó con el .env: se dice en el error si falta una variable (diagnóstico en Plesk). */
let estadoEnv = 'cargado';
try {
  process.loadEnvFile(rutaEnv);
} catch (e) {
  // Sin .env: solo variables del entorno (panel de Plesk, CI, tests).
  estadoEnv = (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'no existe' : `no se pudo leer (${(e as Error).message})`;
}

/**
 * Quita comillas que rodean un valor. El lector de .env de Node 21.7 (el del servidor de
 * Plesk) deja `BASE_DOMAIN=""` como el texto `""` en vez de vacío, y eso rompió la cookie de
 * sesión (2026-10-24). Se normalizan solo las variables de la app.
 */
const VARIABLES = [
  'NODE_ENV', 'PORT', 'DATABASE_URL', 'DATABASE_ADMIN_URL', 'APP_URL', 'SESSION_SECRET', 'BASE_DOMAIN',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'SOPORTE_BETA',
];
for (const nombre of VARIABLES) {
  const v = process.env[nombre];
  if (v === undefined) continue;
  const m = /^\s*(["'])([\s\S]*)\1\s*$/.exec(v);
  process.env[nombre] = m ? m[2] : v.trim();
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';

function req(nombre: string): string {
  const v = process.env[nombre];
  if (!v) throw new Error(`Falta la variable de entorno ${nombre}. Archivo ${rutaEnv}: ${estadoEnv}.`);
  return v;
}

/** En producción no acepta el valor de desarrollo: un secreto público que llega a producción no rompe nada visible. */
function reqEnProduccion(nombre: string, dev: string): string {
  const v = process.env[nombre];
  if (v) return v;
  if (isProd) throw new Error(`Falta ${nombre}: es obligatoria con NODE_ENV=production.`);
  return dev;
}

/** Un dominio raro rompe la cookie en el primer login: mejor no arrancar y decir por qué. */
function dominioBase(v: string | undefined): string {
  const d = (v ?? '').trim().toLowerCase();
  if (d && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) {
    throw new Error(`BASE_DOMAIN no es un dominio válido: ${JSON.stringify(v)}. Déjalo vacío (BASE_DOMAIN=) o pon algo como app.com.`);
  }
  return d;
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
  baseDomain: dominioBase(process.env.BASE_DOMAIN),
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
