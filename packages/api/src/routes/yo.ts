import type { FastifyInstance } from 'fastify';
import { conUsuario } from '../lib/contexto.js';
import { exigirCuenta, exigirUsuario } from '../plugins/contexto.js';

export default async function rutasYo(app: FastifyInstance) {
  /** Quién soy en esta cuenta. La web lo pide al cargar. */
  app.get('/api/v1/yo', async (req) => {
    const { cuenta, usuario, rol } = exigirCuenta(req);
    return {
      usuario: { id: usuario.id, name: usuario.name, email: usuario.email },
      cuenta: { id: cuenta.id, slug: cuenta.slug, name: cuenta.name, plan: cuenta.plan },
      rol,
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
}
