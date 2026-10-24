export async function registrarEvento(tx, datos) {
    const e = await tx.event.create({
        data: {
            accountId: datos.accountId,
            projectId: datos.projectId,
            recordingId: datos.recordingId ?? null,
            actorId: datos.actorId,
            action: datos.action,
            details: datos.details,
            visibleToClients: datos.visibleToClients ?? false,
        },
        select: { id: true },
    });
    return e.id;
}
