/**
 * Crea una cuenta con su dueño, desde la consola (en el MVP no hay registro abierto).
 *
 *   npm run cuenta:crear -- <slug> "<Nombre de la cuenta>" <correo> ["Nombre de la persona"] [--clave]
 *
 * Persona nueva: se le genera una contraseña y se imprime UNA vez (en el MVP no hay correo:
 * se le pasa a mano). Si la persona ya existe (está en otra cuenta), se suma como dueña sin
 * crear otra identidad y conserva su contraseña; con --clave se le genera una nueva.
 * Usa pm_admin: es un script de soporte, no una petición de usuario.
 */
import { slugValido } from '@lucuma-pm/shared';
import { prismaAdmin } from '../db.js';
import { generarPassword, hashPassword } from '../lib/password.js';
async function main() {
    const args = process.argv.slice(2).filter((a) => a !== '--clave');
    const conClave = process.argv.includes('--clave');
    const [slugCrudo, nombreCuenta, correoCrudo, nombrePersona] = args;
    if (!slugCrudo || !nombreCuenta || !correoCrudo) {
        console.error('Uso: npm run cuenta:crear -- <slug> "<Nombre de la cuenta>" <correo> ["Nombre"] [--clave]');
        process.exit(1);
    }
    const slug = slugCrudo.toLowerCase();
    const email = correoCrudo.trim().toLowerCase();
    if (!slugValido(slug)) {
        console.error(`Slug inválido o reservado: "${slug}" (minúsculas, números y guiones; 2 a 40).`);
        process.exit(1);
    }
    if (await prismaAdmin.account.findUnique({ where: { slug } })) {
        console.error(`Ya existe una cuenta con el slug "${slug}".`);
        process.exit(1);
    }
    const existia = await prismaAdmin.user.findUnique({ where: { email }, select: { id: true } });
    const clave = conClave || !existia ? generarPassword() : null;
    const resultado = await prismaAdmin.$transaction(async (tx) => {
        const cuenta = await tx.account.create({ data: { slug, name: nombreCuenta } });
        const existente = await tx.user.findUnique({ where: { email } });
        const user = existente ??
            (await tx.user.create({ data: { email, name: nombrePersona?.trim() || email.split('@')[0] } }));
        if (clave) {
            await tx.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(clave), passwordChangedAt: new Date() } });
        }
        await tx.membership.create({ data: { accountId: cuenta.id, userId: user.id, role: 'owner' } });
        await tx.auditLog.create({ data: { accountId: cuenta.id, userId: user.id, action: 'account.create', meta: { via: 'consola' } } });
        return { cuenta, user, nuevo: !existente };
    });
    console.log(`Cuenta creada: ${resultado.cuenta.name} (${slug})`);
    console.log(`Dueño: ${resultado.user.email}${resultado.nuevo ? ' (persona nueva)' : ' (ya existía, se sumó)'}`);
    if (clave)
        console.log(`Contraseña: ${clave}   ← se muestra solo esta vez`);
    else
        console.log('Conserva su contraseña actual (con --clave se le genera una nueva).');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(() => prismaAdmin.$disconnect());
