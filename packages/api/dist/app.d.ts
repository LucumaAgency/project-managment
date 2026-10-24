import Fastify from 'fastify';
export interface OpcionesApp {
    /** Por defecto `env.baseDomain`. Los tests lo cambian para probar ambos modos. */
    baseDomain?: string;
    /** Por defecto `env.soporteBeta`. */
    soporteBeta?: boolean;
    logger?: boolean;
}
export declare function buildApp(opciones?: OpcionesApp): Promise<Fastify.FastifyInstance<import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, Fastify.FastifyBaseLogger, Fastify.FastifyTypeProviderDefault>>;
