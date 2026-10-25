import type { Tx } from '../lib/contexto.js';

/**
 * Quién puede ser mencionado en un elemento: personas activas de la cuenta que ven el
 * proyecto (dueño y admin siempre; el resto si está en el proyecto). Si el elemento no es
 * visible para clientes, los clientes quedan fuera: no se les avisa de algo que no pueden ver.
 */
export async function mencionables(tx: Tx, accountId: string, projectId: string, opciones: { incluirClientes: boolean }) {
  const filas = await tx.membership.findMany({
    where: {
      accountId,
      status: 'active',
      // Un bot (D-63) no se menciona ni se asigna: no lee la bandeja.
      user: { isBot: false },
      ...(opciones.incluirClientes ? {} : { role: { not: 'client' } }),
      OR: [
        { role: { in: ['owner', 'admin'] } },
        { user: { projectRoles: { some: { projectId } } } },
      ],
    },
    select: { role: true, user: { select: { id: true, name: true } } },
    orderBy: { user: { name: 'asc' } },
  });
  return filas.map((f) => ({ userId: f.user.id, name: f.user.name, role: f.role }));
}

/**
 * Reemplaza las menciones guardadas de un elemento por las del documento nuevo, quedándose
 * solo con las válidas. Devuelve los userIds que quedaron (los que recibirán aviso, día 11).
 * Las menciones salen del documento procesado en el servidor, nunca de una lista que mande
 * el navegador.
 */
export async function guardarMenciones(
  tx: Tx,
  datos: { accountId: string; projectId: string; recordingId: string; ids: string[]; visibleParaClientes: boolean }
) {
  const validos = new Set(
    (await mencionables(tx, datos.accountId, datos.projectId, { incluirClientes: datos.visibleParaClientes })).map((p) => p.userId)
  );
  const quedan = datos.ids.filter((id) => validos.has(id));
  await tx.mention.deleteMany({ where: { recordingId: datos.recordingId } });
  if (quedan.length) {
    await tx.mention.createMany({
      data: quedan.map((userId) => ({ accountId: datos.accountId, recordingId: datos.recordingId, userId })),
    });
  }
  return quedan;
}
