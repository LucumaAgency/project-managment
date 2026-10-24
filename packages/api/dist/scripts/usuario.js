/**
 * Soporte de personas desde la consola (en el MVP no hay correo para recuperar contraseña).
 *
 *   npm run usuario -- clave <correo>            genera una contraseña nueva, la imprime UNA vez
 *                                                y cierra todas sus sesiones
 *   npm run usuario -- soporte <correo>          marca a la persona como soporte de Lucuma
 *   npm run usuario -- soporte <correo> --quitar le quita la marca
 *
 * Soporte (isStaff), durante la beta (SOPORTE_BETA distinto de 0), entra a cualquier cuenta
 * como administrador y cada entrada queda en el registro de auditoría de esa cuenta.
 * Usa pm_admin: es un script de soporte, no una petición de usuario.
 */
import { prismaAdmin } from '../db.js';
import { generarPassword, hashPassword } from '../lib/password.js';
const USO = 'Uso: npm run usuario -- clave <correo> | soporte <correo> [--quitar]';
async function main() {
    const [accion, correoCrudo] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    const quitar = process.argv.includes('--quitar');
    if (!accion || !correoCrudo) {
        console.error(USO);
        process.exit(1);
    }
    const email = correoCrudo.trim().toLowerCase();
    const user = await prismaAdmin.user.findUnique({ where: { email } });
    if (!user) {
        console.error(`No existe una persona con el correo ${email}.`);
        process.exit(1);
    }
    if (accion === 'clave') {
        const clave = generarPassword();
        await prismaAdmin.$transaction([
            prismaAdmin.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(clave), passwordChangedAt: new Date() } }),
            prismaAdmin.session.deleteMany({ where: { userId: user.id } }),
            prismaAdmin.auditLog.create({ data: { userId: user.id, action: 'user.password', meta: { via: 'consola' } } }),
        ]);
        console.log(`Contraseña nueva de ${email}: ${clave}   ← se muestra solo esta vez`);
        console.log('Se cerraron todas sus sesiones. Puede cambiarla en Mi cuenta.');
    }
    else if (accion === 'soporte') {
        await prismaAdmin.$transaction([
            prismaAdmin.user.update({ where: { id: user.id }, data: { isStaff: !quitar } }),
            prismaAdmin.auditLog.create({ data: { userId: user.id, action: quitar ? 'soporte.quitar' : 'soporte.dar', meta: { via: 'consola' } } }),
        ]);
        console.log(quitar ? `${email} ya no es soporte.` : `${email} ahora es soporte de Lucuma (entra a cualquier cuenta durante la beta).`);
    }
    else {
        console.error(USO);
        process.exit(1);
    }
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(() => prismaAdmin.$disconnect());
