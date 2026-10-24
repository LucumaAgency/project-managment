import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import cookie from '@fastify/cookie';
import { correoActivo, env } from './env.js';
import { prisma } from './db.js';
import { HttpError } from './lib/errores.js';
import { registrarContexto } from './plugins/contexto.js';
import rutasAuth from './routes/auth.js';
import rutasElementos from './routes/elementos.js';
import rutasInvitaciones from './routes/invitaciones.js';
import rutasPersonas from './routes/personas.js';
import rutasProyectos from './routes/proyectos.js';
import rutasTareas from './routes/tareas.js';
import rutasYo from './routes/yo.js';

export interface OpcionesApp {
  /** Por defecto `env.baseDomain`. Los tests lo cambian para probar ambos modos. */
  baseDomain?: string;
  /** Por defecto `env.soporteBeta`. */
  soporteBeta?: boolean;
  logger?: boolean;
}

/** Raíz del repo: dist/app.js y src/app.ts están a tres niveles. */
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
/** El SPA compilado (vite lo deja en <raíz>/public, que es el docroot en Plesk). */
const WEB = path.join(RAIZ, 'public');

/**
 * En producción el log va a logs/app.txt (fuera del docroot): Passenger se queda con la salida
 * estándar y es incómodo de encontrar. `.txt` para que el Administrador de archivos de Plesk lo
 * abra. Mismo criterio que el CRM.
 */
function opcionesLog(opciones: OpcionesApp) {
  if (opciones.logger === false) return false;
  if (!env.isProd) return { level: 'debug' };
  const dir = path.join(RAIZ, 'logs');
  fs.mkdirSync(dir, { recursive: true });
  return { level: 'info', file: path.join(dir, 'app.txt') };
}

export async function buildApp(opciones: OpcionesApp = {}) {
  const app = Fastify({
    logger: opcionesLog(opciones),
    trustProxy: true,
    bodyLimit: 1_000_000,
  });

  // Errores previstos traducidos; el resto se registra entero y sale genérico (no filtrar
  // nombres de tablas o índices al navegador). Mismo criterio que el CRM.
  app.setErrorHandler((err: Error & { code?: string; statusCode?: number; validation?: unknown }, req, reply) => {
    // Errores que la propia app lanza a propósito (incluido 503): su código y su mensaje.
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
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
  await app.register(rutasProyectos);
  await app.register(rutasElementos);
  await app.register(rutasTareas);

  // La web: nginx entrega los estáticos desde el docroot; lo que llega aquí son las rutas del
  // SPA (/proyectos/abc al recargar). Un archivo que falta da 404, no el index.html.
  if (fs.existsSync(path.join(WEB, 'index.html'))) {
    await app.register(fastifyStatic, { root: WEB, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'No encontrado.' });
      if (req.method !== 'GET' || /\.[a-z0-9]+(\?|$)/i.test(req.url)) return reply.code(404).send({ error: 'No encontrado.' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
