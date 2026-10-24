import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { correoActivo, env } from './env.js';
import { prisma } from './db.js';
import { registrarContexto } from './plugins/contexto.js';
import rutasAuth from './routes/auth.js';
import rutasInvitaciones from './routes/invitaciones.js';
import rutasPersonas from './routes/personas.js';
import rutasYo from './routes/yo.js';

export interface OpcionesApp {
  /** Por defecto `env.baseDomain`. Los tests lo cambian para probar ambos modos. */
  baseDomain?: string;
  /** Por defecto `env.soporteBeta`. */
  soporteBeta?: boolean;
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

  // Solo JSON: sin el parser de texto plano, un formulario de otro sitio no puede mandar un
  // POST "simple" (sin preflight) a la API.
  app.removeContentTypeParser('text/plain');
  await app.register(cookie);
  registrarContexto(app, {
    baseDomain: opciones.baseDomain ?? env.baseDomain,
    soporteBeta: opciones.soporteBeta ?? env.soporteBeta,
  });

  /** Salud: la API responde y llega a la base con el rol de la app. */
  app.get('/api/v1/salud', async () => {
    const [fila] = await prisma.$queryRaw<{ usuario: string; version: string }[]>`
      SELECT current_user AS usuario, current_setting('server_version') AS version`;
    return { ok: true, postgres: fila.version, rol: fila.usuario };
  });

  /** Lo que la web necesita saber del despliegue antes de tener sesión. */
  // `correo`: si hay correo saliente. Sin él (MVP) la web no ofrece el acceso por enlace.
  app.get('/api/v1/config', async () => ({ baseDomain: app.config.baseDomain, correo: correoActivo() }));

  await app.register(rutasAuth);
  await app.register(rutasYo);
  await app.register(rutasPersonas);
  await app.register(rutasInvitaciones);

  return app;
}
