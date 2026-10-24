import type { FastifyInstance } from 'fastify';
import { conUsuario } from '../lib/contexto.js';
import { HttpError } from '../lib/errores.js';
import { exigirCuenta, exigirUsuario } from '../plugins/contexto.js';

export default async function rutasYo(app: FastifyInstance) {
  /** Quién soy en esta cuenta. La web lo pide al cargar. */
  app.get('/api/v1/yo', async (req) => {
    const { cuenta, usuario, rol, soporte } = exigirCuenta(req);
    return {
      usuario: { id: usuario.id, name: usuario.name, email: usuario.email },
      cuenta: { id: cuenta.id, slug: cuenta.slug, name: cuenta.name, plan: cuenta.plan },
      rol,
      /** Entró como soporte de Lucuma sin ser miembro (beta): la web lo muestra en una franja. */
      soporte,
    };
  });

  /** Cuentas a las que puedo entrar (selector tras el login). No necesita cuenta. */
  app.get('/api/v1/mis-cuentas', async (req) => {
    const usuario = exigirUsuario(req);
    const cuentas = await conUsuario(usuario.id, (tx) =>
      tx.$queryRaw<{ id: string; slug: string; name: string; role: string }[]>`
        SELECT * FROM cuentas_de_usuario()`
    );
    return { cuentas };
  });

  /** Soporte de Lucuma (beta): todas las cuentas abiertas, para entrar a ayudar. */
  app.get('/api/v1/soporte/cuentas', async (req) => {
    const usuario = exigirUsuario(req);
    if (!usuario.isStaff || !req.server.config.soporteBeta) throw new HttpError(403, 'Solo soporte de Lucuma.');
    const cuentas = await conUsuario(usuario.id, (tx) =>
      tx.$queryRaw<{ id: string; slug: string; name: string; plan: string }[]>`SELECT * FROM cuentas_para_soporte()`
    );
    return { cuentas };
  });
}
