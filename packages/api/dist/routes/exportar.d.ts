import type { FastifyInstance } from 'fastify';
/**
 * GET /cuenta/exportar: descarga el ZIP con toda la cuenta (services/exportar.ts). Solo el
 * dueño; soporte no (son los datos del cliente). Queda en el registro de seguridad.
 */
export default function rutasExportar(app: FastifyInstance): Promise<void>;
