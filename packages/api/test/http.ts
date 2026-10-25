import type { FastifyInstance } from 'fastify';
import { COOKIE_SESION } from '../src/lib/sesion.js';

/** Petición por HTTP en memoria, con sesión y cuenta (encabezado X-Cuenta). */
export function cliente(app: FastifyInstance, cookie: string, cuenta: string) {
  const pedir = async (metodo: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, body?: object) => {
    const headers: Record<string, string> = { cookie: `${COOKIE_SESION}=${cookie}`, 'x-cuenta': cuenta };
    if (body) headers['content-type'] = 'application/json';
    const r = await app.inject({ method: metodo, url: `/api/v1${url}`, headers, payload: body ? JSON.stringify(body) : undefined });
    return { status: r.statusCode, json: r.json() as any };
  };
  return {
    get: (url: string) => pedir('GET', url),
    post: (url: string, body: object = {}) => pedir('POST', url, body),
    patch: (url: string, body: object) => pedir('PATCH', url, body),
    put: (url: string, body: object) => pedir('PUT', url, body),
    delete: (url: string) => pedir('DELETE', url),
  };
}
export type Cliente = ReturnType<typeof cliente>;
