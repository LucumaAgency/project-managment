/**
 * Carga inicial de proyectos desde un archivo JSON (día 15, D-61): para empezar a usar la app
 * con los proyectos reales sin crearlos uno por uno. Usa los mismos servicios que la web
 * (permisos, eventos, avisos), así que lo cargado es igual a lo creado a mano.
 *
 * Se puede correr más de una vez: un proyecto que ya existe con ese nombre (activo o
 * archivado) se salta entero. El archivo con datos de clientes NO va al repo (es público):
 * se sube a privados/ con el Administrador de archivos de Plesk.
 */
import { z } from 'zod';
import type { Rol } from '@lucuma-pm/shared';
import { prismaAdmin } from '../db.js';
import { conCuenta } from '../lib/contexto.js';
import { crearElemento } from './elementos.js';
import { registrarEvento } from './eventos.js';
import type { Actor } from './permisos.js';
import { crearTarea } from './tareas.js';

const correo = z.string().trim().toLowerCase().email('Correo inválido.');
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha como AAAA-MM-DD.');

export const esquemaCarga = z.object({
  cuenta: z.string().min(1),
  /** Quién figura como creador: dueño o administrador de la cuenta. */
  como: correo,
  proyectos: z
    .array(
      z.object({
        nombre: z.string().trim().min(1).max(120),
        descripcion: z.string().max(2000).optional(),
        /** Correos de gente de la cuenta (equipo) que entra al proyecto. */
        personas: z.array(correo).default([]),
        listas: z
          .array(
            z.object({
              titulo: z.string().trim().min(1).max(300),
              tareas: z
                .array(
                  z.union([
                    z.string().trim().min(1).max(300),
                    z.object({ titulo: z.string().trim().min(1).max(300), vence: fecha.optional(), responsables: z.array(correo).default([]), notas: z.string().max(10_000).optional() }),
                  ])
                )
                .default([]),
            })
          )
          .default([]),
        mensajes: z.array(z.object({ titulo: z.string().trim().min(1).max(300), texto: z.string().max(50_000).default('') })).default([]),
      })
    )
    .min(1),
});
export type Carga = z.infer<typeof esquemaCarga>;

export interface Informe {
  creados: string[];
  saltados: string[];
  listas: number;
  tareas: number;
  mensajes: number;
}

/** Valida y prepara: cuenta, quién carga, y que cada correo sea de alguien del equipo. */
export async function prepararCarga(datos: unknown) {
  const r = esquemaCarga.safeParse(datos);
  if (!r.success) {
    const e = r.error.issues[0];
    throw new Error(`El archivo no es válido en ${e.path.join('.') || '(raíz)'}: ${e.message}`);
  }
  const carga = r.data;
  const cuenta = await prismaAdmin.account.findUnique({ where: { slug: carga.cuenta }, select: { id: true, name: true } });
  if (!cuenta) throw new Error(`No existe la cuenta «${carga.cuenta}».`);
  const correos = [...new Set([carga.como, ...carga.proyectos.flatMap((p) => [...p.personas, ...p.listas.flatMap((l) => l.tareas.flatMap((t) => (typeof t === 'string' ? [] : t.responsables)))])])];
  const miembros = await prismaAdmin.membership.findMany({
    where: { accountId: cuenta.id, status: 'active', user: { email: { in: correos } } },
    select: { role: true, user: { select: { id: true, email: true } } },
  });
  const porCorreo = new Map(miembros.map((m) => [m.user.email.toLowerCase(), { id: m.user.id, rol: m.role as Rol }]));
  const faltan = correos.filter((c) => !porCorreo.has(c));
  if (faltan.length) throw new Error(`Estos correos no son de personas activas de la cuenta: ${faltan.join(', ')}. Invítalas primero.`);
  const clientes = correos.filter((c) => c !== carga.como && porCorreo.get(c)!.rol === 'client');
  if (clientes.length) throw new Error(`La carga es solo para el equipo; estos son clientes: ${clientes.join(', ')}. A los clientes se los agrega desde la web.`);
  const quien = porCorreo.get(carga.como)!;
  if (quien.rol !== 'owner' && quien.rol !== 'admin') throw new Error(`«${carga.como}» tiene que ser dueño o administrador de la cuenta.`);
  return { carga, cuenta, porCorreo, actor: { ctx: { accountId: cuenta.id, userId: quien.id }, rol: quien.rol } satisfies Actor };
}

/** Carga (o, con `probar`, solo dice qué haría). */
export async function cargar(datos: unknown, opciones: { probar?: boolean } = {}): Promise<Informe> {
  const { carga, cuenta, porCorreo, actor } = await prepararCarga(datos);
  const informe: Informe = { creados: [], saltados: [], listas: 0, tareas: 0, mensajes: 0 };
  const existentes = new Set(
    (await prismaAdmin.project.findMany({ where: { accountId: cuenta.id, status: { in: ['active', 'archived'] } }, select: { name: true } })).map((p) => p.name.trim().toLowerCase())
  );
  const id = (c: string) => porCorreo.get(c)!.id;

  for (const p of carga.proyectos) {
    if (existentes.has(p.nombre.toLowerCase())) {
      informe.saltados.push(p.nombre);
      continue;
    }
    existentes.add(p.nombre.toLowerCase());
    const cuantas = p.listas.reduce((s, l) => s + l.tareas.length, 0);
    if (opciones.probar) {
      informe.creados.push(p.nombre);
      informe.listas += p.listas.length;
      informe.tareas += cuantas;
      informe.mensajes += p.mensajes.length;
      continue;
    }
    // Un proyecto por transacción: si uno falla, los anteriores quedan y se puede reintentar.
    await conCuenta(actor.ctx, async (tx) => {
      const proyecto = await tx.project.create({
        data: {
          accountId: cuenta.id,
          name: p.nombre,
          description: p.descripcion || null,
          createdById: actor.ctx.userId,
          members: { create: [...new Set([actor.ctx.userId, ...p.personas.map(id)])].map((userId) => ({ accountId: cuenta.id, userId })) },
        },
        select: { id: true },
      });
      await registrarEvento(tx, { accountId: cuenta.id, projectId: proyecto.id, actorId: actor.ctx.userId, action: 'created' });
      for (const l of p.listas) {
        const lista = await crearElemento(tx, actor, proyecto.id, { type: 'todolist', title: l.titulo });
        for (const t of l.tareas) {
          const tarea = typeof t === 'string' ? { titulo: t, responsables: [] as string[] } : t;
          await crearTarea(tx, actor, lista.id, {
            title: tarea.titulo,
            dueOn: 'vence' in tarea ? (tarea.vence ?? null) : null,
            assigneeIds: tarea.responsables.map(id),
            ...('notas' in tarea && tarea.notas ? { body: { type: 'doc', content: tarea.notas.split(/\n{2,}/).map((x) => ({ type: 'paragraph', content: [{ type: 'text', text: x }] })) } } : {}),
          });
        }
      }
      for (const m of p.mensajes) await crearElemento(tx, actor, proyecto.id, { type: 'message', title: m.titulo, bodyText: m.texto });
    });
    informe.creados.push(p.nombre);
    informe.listas += p.listas.length;
    informe.tareas += cuantas;
    informe.mensajes += p.mensajes.length;
  }
  return informe;
}
