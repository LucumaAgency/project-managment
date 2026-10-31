/**
 * Primeros pasos (D-76): qué le falta a la persona para empezar a usar la cuenta, igual que la
 * guía del CRM. Cada paso se da por hecho mirando los datos, no marcando una casilla. Los pasos
 * dependen del rol: quien administra arma proyecto, tareas, equipo y cliente; el equipo trabaja
 * tareas y comentarios; el cliente responde lo que le piden.
 *
 * Lo que la persona decidió (ya la vio, la ocultó) se guarda en Membership.prefs de ESTA cuenta.
 */
import type { FastifyInstance } from 'fastify';
import { veTodosLosProyectos } from '@lucuma-pm/shared';
import { z } from 'zod';
import { conCuenta, type Tx } from '../lib/contexto.js';
import { leer } from '../lib/validar.js';
import { exigirCuenta } from '../plugins/contexto.js';

interface Paso {
  id: string;
  titulo: string;
  texto: string;
  enlace: string;
  accion: string;
  hecho: boolean;
  opcional?: boolean;
}

interface Prefs {
  guiaVista?: string;
  guiaOculta?: string;
  [k: string]: unknown;
}

/** Fecha en que se publicó la guía: se abre sola solo a quien entró a la cuenta desde ese día. */
const GUIA_DESDE = new Date('2026-10-31T00:00:00-05:00');

const accion = z.object({ accion: z.enum(['vista', 'ocultar', 'mostrar']) });

export default async function rutasPrimerosPasos(app: FastifyInstance) {
  app.get('/api/v1/primeros-pasos', async (req) => {
    const { ctx, rol, soporte } = exigirCuenta(req);
    // Soporte de Lucuma entra sin membresía: no hay guía que mostrarle.
    if (soporte) return { rol, pasos: [], completados: 0, total: 0, abrirAsistente: false, oculto: true };

    return conCuenta(ctx, async (tx) => {
      const { accountId, userId } = ctx;
      const membresia = await tx.membership.findUniqueOrThrow({
        where: { accountId_userId: { accountId, userId } },
        select: { prefs: true, createdAt: true },
      });
      const proyecto = await primerProyecto(tx, accountId, userId, veTodosLosProyectos(rol));
      const en = (seccion = '') => (proyecto ? `/proyectos/${proyecto}${seccion}` : '/');
      // Sin proyecto todavía, los pasos de adentro llevan a Proyectos y lo dicen.
      const ir = (texto: string) => (proyecto ? texto : 'Ir a Proyectos');
      const propio = { accountId, creatorId: userId, status: { not: 'trashed' as const } };

      const bandejaLeida = (await tx.notification.count({ where: { accountId, userId, readAt: { not: null } } })) > 0;
      const pasoBandeja: Paso = {
        id: 'bandeja',
        titulo: 'Revisa tu Bandeja',
        texto:
          'Cuando alguien te asigna una tarea, te menciona o comenta algo que sigues, te llega un aviso a la Bandeja (en el menú). Abre uno y queda marcado como leído.',
        enlace: '/bandeja',
        accion: 'Ir a la Bandeja',
        hecho: bandejaLeida,
      };

      const pasos: Paso[] = [];
      if (rol === 'owner' || rol === 'admin') {
        const [proyectos, tareas, equipo, invEquipo, clientes, invClientes, mensajes, plantillas] = await Promise.all([
          tx.project.count({ where: { accountId, status: { not: 'trashed' } } }),
          tx.recording.count({ where: { accountId, type: 'todo', status: { not: 'trashed' } } }),
          tx.membership.count({ where: { accountId, role: { not: 'client' }, status: 'active', user: { isBot: false } } }),
          tx.invitation.count({ where: { accountId, role: { not: 'client' } } }),
          tx.membership.count({ where: { accountId, role: 'client' } }),
          tx.invitation.count({ where: { accountId, role: 'client' } }),
          tx.recording.count({ where: { accountId, type: 'message', status: { not: 'trashed' } } }),
          tx.listTemplate.count({ where: { accountId } }),
        ]);
        pasos.push(
          {
            id: 'proyecto',
            titulo: 'Crea tu primer proyecto',
            texto:
              'Un proyecto es un trabajo con un cliente (por ejemplo «Web de la Clínica Sol» o «Redes de noviembre»). Ahí viven sus tareas, mensajes y archivos. Usa el botón «Nuevo proyecto» en Proyectos.',
            enlace: '/',
            accion: 'Ir a Proyectos',
            hecho: proyectos > 0,
          },
          {
            id: 'tareas',
            titulo: 'Arma la lista de tareas',
            texto:
              'En Tareas creas listas (por ejemplo «Diseño», «Contenido») y dentro sus tareas, con responsable y fecha. Una lista también se puede ver como tablero, con columnas.',
            enlace: en('/tareas'),
            accion: ir('Ir a Tareas'),
            hecho: tareas > 0,
          },
          {
            id: 'equipo',
            titulo: 'Invita a tu equipo',
            texto:
              'En Personas generas un enlace de invitación para cada persona de tu agencia y se lo mandas por WhatsApp. Luego la sumas a los proyectos donde trabaja.',
            enlace: '/personas',
            accion: 'Ir a Personas',
            hecho: equipo > 1 || invEquipo > 0,
            opcional: true,
          },
          {
            id: 'cliente',
            titulo: 'Invita a tu cliente',
            texto:
              'Dentro del proyecto, en «Personas del proyecto», invitas al cliente con su correo. Entra gratis y solo ve lo que marques como visible para clientes: así aprueba, comenta y te pasa lo que necesitas sin perderse en WhatsApp.',
            enlace: en(),
            accion: ir('Ir al proyecto'),
            hecho: clientes > 0 || invClientes > 0,
          },
          {
            id: 'mensaje',
            titulo: 'Publica un mensaje',
            texto:
              'Los Mensajes son anuncios del proyecto: el arranque, un avance, una entrega. Quedan ordenados con sus comentarios en vez de perderse en un chat.',
            enlace: en('/mensajes'),
            accion: ir('Ir a Mensajes'),
            hecho: mensajes > 0,
            opcional: true,
          },
          {
            id: 'plantillas',
            titulo: 'Ahorra tiempo con plantillas',
            texto:
              'Si repites el mismo proceso con cada cliente (onboarding, una web, el reporte del mes), guárdalo como plantilla y agrégalo a un proyecto con un clic.',
            enlace: '/plantillas',
            accion: 'Ir a Plantillas',
            hecho: plantillas > 0,
            opcional: true,
          },
          pasoBandeja,
        );
      } else if (rol === 'member') {
        const [creadas, completadas, comentarios] = await Promise.all([
          tx.recording.count({ where: { ...propio, type: 'todo' } }),
          tx.todoDetail.count({ where: { completedById: userId, recording: { accountId } } }),
          tx.recording.count({ where: { ...propio, type: 'comment' } }),
        ]);
        pasos.push(
          {
            id: 'tareas',
            titulo: 'Trabaja tus tareas',
            texto:
              'En cada proyecto, Tareas muestra las listas con su responsable y fecha. Crea las que falten y marca las tuyas cuando las termines: el equipo y el cliente ven el avance.',
            enlace: en('/tareas'),
            accion: ir('Ir a Tareas'),
            hecho: creadas + completadas > 0,
          },
          {
            id: 'comentario',
            titulo: 'Comenta en una tarea',
            texto:
              'Abre una tarea y escribe abajo. Con @ mencionas a alguien y le llega un aviso. Así la conversación queda junto al trabajo y no en el chat.',
            enlace: en('/tareas'),
            accion: ir('Ir a Tareas'),
            hecho: comentarios > 0,
          },
          {
            id: 'timeline',
            titulo: 'Mira lo que viene en el Timeline',
            texto: 'El Timeline (en el menú) junta las tareas con fecha de todos tus proyectos, en línea de tiempo o como agenda.',
            enlace: '/timeline',
            accion: 'Ir al Timeline',
            hecho: false,
            opcional: true,
          },
          pasoBandeja,
        );
      } else {
        const [completadas, respuestas, comentarios, subidas] = await Promise.all([
          tx.todoDetail.count({ where: { completedById: userId, recording: { accountId } } }),
          tx.taskAnswer.count({ where: { accountId, answeredById: userId } }),
          tx.recording.count({ where: { ...propio, type: 'comment' } }),
          tx.recording.count({ where: { ...propio, type: 'upload' } }),
        ]);
        pasos.push(
          {
            id: 'tareas',
            titulo: 'Revisa lo que te piden',
            texto:
              'En Tareas está lo que la agencia necesita de ti: datos, archivos, accesos o una aprobación. Ábrela, completa lo que pide y márcala como hecha.',
            enlace: en('/tareas'),
            accion: ir('Ir a Tareas'),
            hecho: completadas + respuestas > 0,
          },
          {
            id: 'comentario',
            titulo: 'Pregunta o comenta',
            texto:
              'Abajo de cada tarea o mensaje puedes escribir. Tu comentario le llega a la agencia y queda guardado junto al trabajo.',
            enlace: en('/tareas'),
            accion: ir('Ir a Tareas'),
            hecho: comentarios > 0,
          },
          {
            id: 'archivos',
            titulo: 'Encuentra y sube archivos',
            texto:
              'En Archivos están los entregables que la agencia comparte contigo. También puedes subir los tuyos (logos, fotos, documentos).',
            enlace: en('/archivos'),
            accion: ir('Ir a Archivos'),
            hecho: subidas > 0,
            opcional: true,
          },
          pasoBandeja,
        );
      }

      const prefs = (membresia.prefs ?? {}) as Prefs;
      const completados = pasos.filter((p) => p.hecho).length;
      return {
        rol,
        pasos,
        completados,
        total: pasos.length,
        // Se abre sola una vez, y solo a quien llegó a la cuenta después de que existiera la guía.
        abrirAsistente: !prefs.guiaVista && completados < pasos.length && membresia.createdAt >= GUIA_DESDE,
        oculto: !!prefs.guiaOculta,
      };
    });
  });

  app.post('/api/v1/primeros-pasos', async (req) => {
    const { ctx, soporte } = exigirCuenta(req);
    const { accion: que } = leer(accion, req.body);
    if (soporte) return { ok: true };
    return conCuenta(ctx, async (tx) => {
      const where = { accountId_userId: { accountId: ctx.accountId, userId: ctx.userId } };
      const m = await tx.membership.findUniqueOrThrow({ where, select: { prefs: true } });
      const prefs: Prefs = { ...((m.prefs ?? {}) as Prefs) };
      const ahora = new Date().toISOString();
      if (que === 'vista') prefs.guiaVista ??= ahora;
      if (que === 'ocultar') {
        prefs.guiaOculta = ahora;
        prefs.guiaVista ??= ahora;
      }
      if (que === 'mostrar') delete prefs.guiaOculta;
      await tx.membership.update({ where, data: { prefs: prefs as object } });
      return { ok: true };
    });
  });
}

/** El proyecto al que llevan los enlaces: el más reciente activo donde está (o cualquiera, si ve todos). */
async function primerProyecto(tx: Tx, accountId: string, userId: string, veTodos: boolean): Promise<string | null> {
  const p = await tx.project.findFirst({
    where: { accountId, status: 'active', ...(veTodos ? {} : { members: { some: { userId } } }) },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return p?.id ?? null;
}
