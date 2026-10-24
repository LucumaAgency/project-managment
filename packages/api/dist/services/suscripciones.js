/**
 * Quién sigue un elemento (y recibirá aviso de sus comentarios y cambios, día 11).
 *
 * Se sigue solo, sin hacer nada: quien crea algo, quien comenta (sigue lo comentado), a quien
 * mencionan y a quien asignan una tarea. Además se puede seguir y dejar de seguir a mano.
 * Dejar de seguir no se deshace solo: volver a comentar o ser mencionado sí vuelve a sumar.
 */
export async function suscribir(tx, datos) {
    const ids = [...new Set(datos.userIds)];
    if (!ids.length)
        return;
    await tx.subscription.createMany({
        data: ids.map((userId) => ({ accountId: datos.accountId, recordingId: datos.recordingId, userId })),
        skipDuplicates: true,
    });
}
export async function desuscribir(tx, datos) {
    await tx.subscription.deleteMany({ where: { recordingId: datos.recordingId, userId: datos.userId } });
}
export async function suscriptores(tx, recordingId) {
    const filas = await tx.subscription.findMany({
        where: { recordingId },
        select: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
    });
    return filas.map((f) => ({ userId: f.user.id, name: f.user.name }));
}
