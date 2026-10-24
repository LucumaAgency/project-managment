import type { FastifyInstance } from 'fastify';
/** GET /buscar?q=…[&proyecto=id]: lo que la persona puede ver (services/busqueda.ts). */
export default function rutasBusqueda(app: FastifyInstance): Promise<void>;
