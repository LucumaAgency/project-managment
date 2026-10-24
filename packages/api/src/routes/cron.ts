import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { HttpError } from '../lib/errores.js';
import { purgarTodas } from '../services/purga.js';
import { recordatoriosDeTodas } from '../services/recordatorios.js';

/**
 * Latido externo (D-54): un servicio de cron de afuera (cron-job.org) llama esta dirección cada
 * hora y la app crea los recordatorios pendientes de todas las cuentas y purga la papelera
 * (lo que lleva más de 30 días). Mismo patrón que el CRM:
 * el cron de Plesk corre enjaulado y no sirve.
 *
 * Protegido con CRON_TOKEN (encabezado X-PM-Cron, o ?token= si el servicio no permite
 * encabezados). Sin CRON_TOKEN configurado responde 503: un latido que cualquiera puede
 * disparar es una forma gratis de hacer trabajar al servidor.
 */
function tokenValido(dado: string | undefined) {
  if (!env.cronToken || !dado) return false;
  const a = Buffer.from(dado);
  const b = Buffer.from(env.cronToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function rutasCron(app: FastifyInstance) {
  const latido = async (req: { headers: Record<string, unknown>; query: unknown }) => {
    if (!env.cronToken) throw new HttpError(503, 'Falta CRON_TOKEN en el servidor.');
    const dado = (req.headers['x-pm-cron'] as string | undefined) ?? (req.query as { token?: string }).token;
    if (!tokenValido(dado)) throw new HttpError(401, 'Token inválido.');
    const inicio = Date.now();
    const r = await recordatoriosDeTodas();
    const purga = await purgarTodas(new Date(), (e) => app.log.error({ err: e }, 'Purga de papelera'));
    return { ok: true, ...r, purga, ms: Date.now() - inicio };
  };
  app.get('/api/v1/cron/latido', latido);
  app.post('/api/v1/cron/latido', latido);
}
