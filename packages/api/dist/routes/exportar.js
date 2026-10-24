import { auditar } from '../lib/auditoria.js';
import { conCuenta } from '../lib/contexto.js';
import { HttpError } from '../lib/errores.js';
import { exportarCuenta } from '../services/exportar.js';
import { exigirCuenta } from '../plugins/contexto.js';
/**
 * GET /cuenta/exportar: descarga el ZIP con toda la cuenta (services/exportar.ts). Solo el
 * dueño; soporte no (son los datos del cliente). Queda en el registro de seguridad.
 */
export default async function rutasExportar(app) {
    app.get('/api/v1/cuenta/exportar', async (req, reply) => {
        const actor = exigirCuenta(req);
        if (actor.rol !== 'owner' || actor.soporte)
            throw new HttpError(403, 'Solo el dueño de la cuenta puede exportarla.');
        await conCuenta(actor.ctx, (tx) => auditar({ accountId: actor.ctx.accountId, userId: actor.ctx.userId, action: 'cuenta.exportar', ip: req.ip }, tx));
        const { stream, nombre } = await exportarCuenta(actor.ctx, (m) => req.log.warn(m));
        return reply
            .header('content-type', 'application/zip')
            .header('content-disposition', `attachment; filename="${nombre}"`)
            .header('cache-control', 'no-store')
            .send(stream);
    });
}
