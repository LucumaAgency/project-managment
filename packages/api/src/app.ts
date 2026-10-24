import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { env } from './env.js';
import { prisma } from './db.js';
import { registrarContexto } from './plugins/contexto.js';
import rutasYo from './routes/yo.js';

export interface OpcionesApp {
  /** Por defecto `env.baseDomain`. Los tests lo cambian para probar ambos modos. */
  baseDomain?: string;
  logger?: boolean;
}

export async function buildApp(opciones: OpcionesApp = {}) {
  const app = Fastify({
    logger: opciones.logger === false ? false : { level: env.isProd ? 'info' : 'debug' },
    trustProxy: true,
    bodyLimit: 1_000_000,
  });

  // Errores previstos traducidos; el resto se registra entero y sale genérico (no filtrar
  // nombres de tablas o índices al navegador). Mismo criterio que el CRM.
  app.setErrorHandler((err: Error & { code?: string; statusCode?: number; validation?: unknown }, req, reply) => {
    if (err.code === 'P2002') return reply.code(409).send({ error: 'Ya existe un registro con ese valor.' });
    if (err.code === 'P2025') return reply.code(404).send({ error: 'No encontrado.' });
    if (err.validation || err.statusCode === 400) return reply.code(400).send({ error: err.message || 'Datos inválidos.' });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
    req.log.error({ err }, 'Error no controlado');
    return reply.code(500).send({ error: 'Error interno.' });
  });

  await app.register(cookie);
  registrarContexto(app, opciones.baseDomain ?? env.baseDomain);

  /** Salud: la API responde y llega a la base con el rol de la app. */
  app.get('/api/v1/salud', async () => {
    const [fila] = await prisma.$queryRaw<{ usuario: string; version: string }[]>`
      SELECT current_user AS usuario, current_setting('server_version') AS version`;
    return { ok: true, postgres: fila.version, rol: fila.usuario };
  });

  await app.register(rutasYo);

  return app;
}
