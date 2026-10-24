/** Día 15: carga de proyectos desde JSON. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma, prismaAdmin } from '../src/db.js';
import { cargar } from '../src/services/carga.js';
import { sembrarCuenta, type Semilla } from './semilla.js';

let A: Semilla;
let correos: Record<'owner' | 'member' | 'client', string>;

beforeAll(async () => {
  A = await sembrarCuenta('A');
  const us = await prismaAdmin.user.findMany({ where: { id: { in: [A.ownerId, A.memberId, A.clientId] } }, select: { id: true, email: true } });
  const de = (id: string) => us.find((u) => u.id === id)!.email;
  correos = { owner: de(A.ownerId), member: de(A.memberId), client: de(A.clientId) };
});

afterAll(() => Promise.all([prisma.$disconnect(), prismaAdmin.$disconnect()]));

const archivo = () => ({
  cuenta: A.slug,
  como: correos.owner,
  proyectos: [
    {
      nombre: 'Cliente Uno · Web',
      descripcion: 'Rediseño',
      personas: [correos.member],
      listas: [{ titulo: 'Pendientes', tareas: ['Revisar textos', { titulo: 'Subir a producción', vence: '2030-01-15', responsables: [correos.member], notas: 'Primero el respaldo.\n\nLuego subir.' }] }],
      mensajes: [{ titulo: 'Contexto', texto: 'Notas del proyecto.' }],
    },
  ],
});

describe('carga', () => {
  it('probar no guarda nada', async () => {
    const r = await cargar(archivo(), { probar: true });
    expect(r).toMatchObject({ creados: ['Cliente Uno · Web'], listas: 1, tareas: 2, mensajes: 1 });
    expect(await prismaAdmin.project.count({ where: { accountId: A.accountId, name: 'Cliente Uno · Web' } })).toBe(0);
  });

  it('carga proyecto, personas, lista, tareas (con fecha, responsable y notas) y mensajes; la segunda vez lo salta', async () => {
    const r = await cargar(archivo());
    expect(r.creados).toEqual(['Cliente Uno · Web']);
    const p = await prismaAdmin.project.findFirstOrThrow({ where: { accountId: A.accountId, name: 'Cliente Uno · Web' }, include: { members: true } });
    expect(p.members.map((m) => m.userId).sort()).toEqual([A.ownerId, A.memberId].sort());
    const tarea = await prismaAdmin.recording.findFirstOrThrow({ where: { projectId: p.id, title: 'Subir a producción' }, include: { todo: true, assignees: true } });
    expect(tarea.todo?.dueOn?.toISOString().slice(0, 10)).toBe('2030-01-15');
    expect(tarea.assignees.map((a) => a.userId)).toEqual([A.memberId]);
    expect(tarea.bodyHtml).toContain('<p>Primero el respaldo.</p>');
    expect(await prismaAdmin.recording.count({ where: { projectId: p.id, type: 'message' } })).toBe(1);
    expect(await prismaAdmin.event.count({ where: { projectId: p.id } })).toBeGreaterThan(3);

    const otra = await cargar(archivo());
    expect(otra).toMatchObject({ creados: [], saltados: ['Cliente Uno · Web'] });
  });

  it('rechaza con un motivo claro: archivo mal formado, correo ajeno, clientes, quien no es admin', async () => {
    await expect(cargar({ cuenta: A.slug, como: correos.owner, proyectos: [{ nombre: '' }] })).rejects.toThrow(/proyectos\.0\.nombre/);
    await expect(cargar({ ...archivo(), cuenta: 'no-existe' })).rejects.toThrow(/No existe la cuenta/);
    await expect(cargar({ ...archivo(), proyectos: [{ nombre: 'X', personas: ['nadie@x.pe'] }] })).rejects.toThrow(/nadie@x\.pe/);
    await expect(cargar({ ...archivo(), proyectos: [{ nombre: 'X', personas: [correos.client] }] })).rejects.toThrow(/clientes/);
    await expect(cargar({ ...archivo(), como: correos.member })).rejects.toThrow(/dueño o administrador/);
  });
});
