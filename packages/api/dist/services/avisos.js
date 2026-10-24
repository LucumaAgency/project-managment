const FUERZA = { mentioned: 3, assigned: 2, subscribed: 1, due_soon: 0 };
export async function avisar(tx, datos) {
    const elegido = new Map();
    for (const d of datos.destinatarios) {
        if (d.userId === datos.actorId)
            continue;
        const previo = elegido.get(d.userId);
        if (!previo || FUERZA[d.reason] > FUERZA[previo])
            elegido.set(d.userId, d.reason);
    }
    if (!elegido.size)
        return [];
    const activos = await tx.membership.findMany({
        where: { accountId: datos.accountId, status: 'active', userId: { in: [...elegido.keys()] } },
        select: { userId: true, role: true },
    });
    const quienes = activos.filter((m) => datos.visibleToClients || m.role !== 'client').map((m) => m.userId);
    if (!quienes.length)
        return [];
    await tx.notification.createMany({
        data: quienes.map((userId) => ({
            accountId: datos.accountId,
            userId,
            eventId: datos.eventId,
            recordingId: datos.recordingId,
            reason: elegido.get(userId),
        })),
    });
    return quienes;
}
/** Quienes siguen algo, como destinatarios con el motivo "lo sigues". */
export async function seguidoresComo(tx, recordingId) {
    const filas = await tx.subscription.findMany({ where: { recordingId }, select: { userId: true } });
    return filas.map((f) => ({ userId: f.userId, reason: 'subscribed' }));
}
