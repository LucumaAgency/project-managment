import { randomBytes } from 'node:crypto';
import type { AccountRole } from '@prisma/client';
import { prismaAdmin } from '../src/db.js';
import { hashToken } from '../src/lib/sesion.js';

/** Sufijo único: los archivos de test corren en paralelo sobre la misma base. */
export const sufijo = () => randomBytes(4).toString('hex');

export interface Semilla {
  accountId: string;
  slug: string;
  ownerId: string;
  memberId: string;
  clientId: string;
  projectId: string;
  todoId: string;
  messageId: string;
  palabraUnica: string;
}

/**
 * Una cuenta con al menos una fila en CADA tabla con datos de cuenta. Si una tabla quedara
 * vacía, el test de aislamiento pasaría sin probar nada; por eso el test lo verifica.
 * Todo se crea con pm_admin (salta RLS), como haría un script de soporte.
 */
export async function sembrarCuenta(nombre: string): Promise<Semilla> {
  const s = sufijo();
  const slug = `${nombre.toLowerCase()}-${s}`;
  const palabraUnica = `palabra${nombre.toLowerCase()}${s}`;
  const db = prismaAdmin;

  const account = await db.account.create({ data: { name: `Agencia ${nombre}`, slug } });
  const accountId = account.id;
  const [owner, member, client] = await Promise.all(
    ['owner', 'member', 'client'].map((r) =>
      db.user.create({ data: { email: `${r}-${slug}@test.pe`, name: `${r} ${nombre}` } })
    )
  );
  await db.membership.createMany({
    data: [
      { accountId, userId: owner.id, role: 'owner' },
      { accountId, userId: member.id, role: 'member' },
      { accountId, userId: client.id, role: 'client', company: `Cliente de ${nombre}` },
    ],
  });
  await db.invitation.create({
    data: {
      accountId,
      email: `invitado-${slug}@test.pe`,
      tokenHash: hashToken(randomBytes(16).toString('hex')),
      invitedById: owner.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });

  const project = await db.project.create({ data: { accountId, name: `Web ${nombre}`, createdById: owner.id } });
  const projectId = project.id;
  await db.projectMember.createMany({
    data: [member.id, client.id].map((userId) => ({ accountId, projectId, userId })),
  });

  const base = { accountId, projectId, creatorId: owner.id };
  const lista = await db.recording.create({ data: { ...base, type: 'todolist', title: 'Diseño' } });
  await db.listBoard.create({ data: { recordingId: lista.id, accountId, enabled: false, columns: [{ id: 'k1', nombre: 'Sin empezar' }, { id: 'k2', nombre: 'Hecho', tipo: 'hecho' }] } });
  const todo = await db.recording.create({
    data: { ...base, type: 'todo', parentId: lista.id, title: `Home ${palabraUnica}`, bodyText: 'logo grande' },
  });
  const message = await db.recording.create({ data: { ...base, type: 'message', title: 'Brief', bodyText: 'objetivos' } });
  const folder = await db.recording.create({ data: { ...base, type: 'folder', title: 'Entregables' } });
  const upload = await db.recording.create({ data: { ...base, type: 'upload', parentId: folder.id, title: 'home.pdf' } });
  const comment = await db.recording.create({
    data: { ...base, type: 'comment', parentId: todo.id, bodyText: 'revisar', visibleToClients: true },
  });

  await db.todoDetail.create({
    data: { recordingId: todo.id, dueOn: new Date('2026-11-06'), fields: [{ id: 'c1', etiqueta: 'RUC', tipo: 'texto', obligatorio: true }] },
  });
  await db.taskAnswer.create({ data: { accountId, recordingId: todo.id, fieldId: 'c1', value: `2060${s}`, answeredById: member.id } });
  await db.todoAssignee.create({ data: { accountId, recordingId: todo.id, userId: member.id } });

  const blob = await db.blob.create({
    data: {
      accountId,
      storageKey: `${accountId}/2026/10/${s}`,
      filename: 'home.pdf',
      contentType: 'application/pdf',
      byteSize: 1024n,
      status: 'ready',
      createdById: owner.id,
    },
  });
  await db.uploadVersion.create({ data: { recordingId: upload.id, blobId: blob.id, version: 1, uploadedById: owner.id } });
  await db.recordingAttachment.create({ data: { recordingId: message.id, blobId: blob.id } });

  await db.mention.create({ data: { accountId, recordingId: comment.id, userId: member.id } });
  await db.subscription.create({ data: { accountId, recordingId: todo.id, userId: owner.id } });

  const event = await db.event.create({
    data: { accountId, projectId, recordingId: comment.id, actorId: owner.id, action: 'commented' },
  });
  await db.notification.create({
    data: { accountId, userId: member.id, eventId: event.id, recordingId: comment.id, reason: 'mentioned' },
  });
  await db.apiKey.create({ data: { accountId, userId: owner.id, name: 'semilla', prefix: 'lpm_semill', keyHash: `semilla-${accountId}` } });
  const plantilla = await db.listTemplate.create({ data: { accountId, name: `Onboarding ${nombre}`, createdById: owner.id } });
  await db.listTemplateItem.create({ data: { accountId, templateId: plantilla.id, title: 'Datos de la empresa', audience: 'client', dayOffset: 1, position: 1 } });
  await db.templateRecurrence.create({ data: { accountId, projectId: project.id, templateId: plantilla.id, dayOfMonth: 1, createdById: owner.id, nextRunOn: new Date('2099-01-01T00:00:00Z') } });
  await db.auditLog.create({ data: { accountId, userId: owner.id, action: 'user.login' } });

  return {
    accountId,
    slug,
    ownerId: owner.id,
    memberId: member.id,
    clientId: client.id,
    projectId,
    todoId: todo.id,
    messageId: message.id,
    palabraUnica,
  };
}

export async function unirACuenta(userId: string, accountId: string, role: AccountRole) {
  await prismaAdmin.membership.create({ data: { accountId, userId, role } });
}
