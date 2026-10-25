/**
 * Bots y claves de API (D-63). En Plesk → Run script:
 *   bot:prod -- crear <cuenta> ["Bot Lucuma"]   crea el usuario bot (admin de la cuenta) y una clave
 *   bot:prod -- clave <cuenta> ["nombre"]       otra clave para el bot de esa cuenta
 *   bot:prod -- lista <cuenta>                  claves (sin mostrarlas), último uso, revocadas
 *   bot:prod -- revocar <prefijo>               revoca una clave (deja de servir al instante)
 * La clave se muestra UNA sola vez: se copia al bot y no queda en ningún lado.
 */
import { randomBytes } from 'node:crypto';
import { prisma, prismaAdmin } from '../db.js';
import { crearClave } from '../services/bot.js';
async function cuenta(slug) {
    if (!slug)
        throw new Error('Falta la cuenta (slug).');
    const c = await prismaAdmin.account.findUnique({ where: { slug }, select: { id: true, name: true } });
    if (!c)
        throw new Error(`No existe la cuenta «${slug}».`);
    return c;
}
const botDe = (accountId) => prismaAdmin.membership.findFirst({ where: { accountId, status: 'active', user: { isBot: true } }, select: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } });
function mostrar(clave) {
    console.log(`\nClave (cópiala ahora, no se vuelve a mostrar):\n\n  ${clave}\n\nSe usa así: Authorization: Bearer ${clave.slice(0, 10)}…`);
}
async function main() {
    const [accion, a1, a2] = process.argv.slice(2);
    if (accion === 'crear') {
        const c = await cuenta(a1);
        if (await botDe(c.id))
            throw new Error('Esa cuenta ya tiene un bot. Para otra clave: bot:prod -- clave <cuenta>.');
        const nombre = a2?.trim() || 'Bot Lucuma';
        const user = await prismaAdmin.user.create({ data: { email: `bot-${randomBytes(6).toString('hex')}@bots.invalid`, name: nombre, isBot: true } });
        await prismaAdmin.membership.create({ data: { accountId: c.id, userId: user.id, role: 'admin' } });
        await prismaAdmin.auditLog.create({ data: { accountId: c.id, userId: user.id, action: 'bot.crear', meta: { via: 'consola', nombre } } });
        console.log(`Bot «${nombre}» creado en «${c.name}» (administrador: ve todos los proyectos).`);
        mostrar(await crearClave(c.id, user.id, 'principal'));
        return;
    }
    if (accion === 'clave') {
        const c = await cuenta(a1);
        const b = await botDe(c.id);
        if (!b)
            throw new Error('Esa cuenta no tiene bot. Primero: bot:prod -- crear <cuenta>.');
        mostrar(await crearClave(c.id, b.user.id, a2?.trim() || 'otra'));
        await prismaAdmin.auditLog.create({ data: { accountId: c.id, userId: b.user.id, action: 'bot.clave', meta: { via: 'consola' } } });
        return;
    }
    if (accion === 'lista') {
        const c = await cuenta(a1);
        const claves = await prismaAdmin.apiKey.findMany({ where: { accountId: c.id }, include: { user: { select: { name: true } } }, orderBy: { createdAt: 'asc' } });
        if (!claves.length)
            return console.log('No hay claves.');
        for (const k of claves) {
            console.log(`  ${k.prefix}…  ${k.user.name} · ${k.name} · creada ${k.createdAt.toISOString().slice(0, 10)} · último uso ${k.lastUsedAt?.toISOString().slice(0, 16).replace('T', ' ') ?? 'nunca'}${k.revokedAt ? ' · REVOCADA' : ''}`);
        }
        return;
    }
    if (accion === 'revocar') {
        if (!a1 || a1.length < 8)
            throw new Error('Pasa el prefijo que muestra la lista (lpm_xxxxxx).');
        const r = await prismaAdmin.apiKey.updateMany({ where: { prefix: { startsWith: a1.replace(/…$/, '') }, revokedAt: null }, data: { revokedAt: new Date() } });
        console.log(r.count ? `Revocadas: ${r.count}.` : 'No había ninguna clave activa con ese prefijo.');
        return;
    }
    console.log('Uso: bot:prod -- crear <cuenta> ["Bot Lucuma"] | clave <cuenta> | lista <cuenta> | revocar <prefijo>');
    process.exitCode = 1;
}
main()
    .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
})
    .finally(() => Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]));
