import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { conCuenta } from '../lib/contexto.js';
import { leer } from '../lib/validar.js';
import {
  crearElemento,
  editarElemento,
  elementoPara,
  listarElementos,
  papeleraElemento,
  restaurarElemento,
  SELECCION,
  TIPOS_CREABLES,
} from '../services/elementos.js';
import { puede } from '../services/permisos.js';
import { proyectoPara } from '../services/proyectos.js';
import { exigirCuenta } from '../plugins/contexto.js';

/**
 * Rutas genéricas de elementos. Las pantallas de tareas, mensajes y archivos (días 7 a 10)
 * las usan tal cual o con rutas propias que llaman al mismo servicio.
 * Por ahora el cuerpo es texto plano; el editor (día 6) agrega el JSON de Tiptap.
 */
const titulo = z.string().max(300, 'Máximo 300 caracteres.');
const texto = z.string().max(50_000, 'El texto es demasiado largo.');
const id = z.string().min(1).max(40);
const nuevo = z.object({
  type: z.enum(TIPOS_CREABLES),
  parentId: id.nullable().optional(),
  title: titulo.optional(),
  bodyText: texto.optional(),
  visibleToClients: z.boolean().optional(),
});
const edicion = z.object({
  title: titulo.optional(),
  bodyText: texto.nullable().optional(),
  visibleToClients: z.boolean().optional(),
  position: z.number().finite().optional(),
});
const filtro = z.object({
  padre: id.optional(),
  tipo: z.enum(['todolist', 'todo', 'message', 'folder', 'upload', 'comment']).optional(),
});

export default async function rutasElementos(app: FastifyInstance) {
  /** Hijos de un padre (?padre=) o de la raíz del proyecto, opcionalmente de un tipo. */
  app.get<{ Params: { id: string } }>('/api/v1/proyectos/:id/elementos', async (req) => {
    const actor = exigirCuenta(req);
    const f = leer(filtro, req.query);
    return conCuenta(actor.ctx, async (tx) => {
      const proyecto = await proyectoPara(tx, actor, req.params.id, 'proyecto.ver');
      return { elementos: await listarElementos(tx, actor, proyecto, { parentId: f.padre ?? null, type: f.tipo }) };
    });
  });

  app.post<{ Params: { id: string } }>('/api/v1/proyectos/:id/elementos', async (req) => {
    const actor = exigirCuenta(req);
    const datos = leer(nuevo, req.body);
    return conCuenta(actor.ctx, async (tx) => ({ elemento: await crearElemento(tx, actor, req.params.id, datos) }));
  });

  app.get<{ Params: { id: string } }>('/api/v1/elementos/:id', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, async (tx) => {
      const { proyecto, elemento } = await elementoPara(tx, actor, req.params.id, 'elemento.ver');
      const fila = await tx.recording.findUniqueOrThrow({ where: { id: elemento.id }, select: SELECCION });
      return {
        elemento: fila,
        permisos: {
          editar: puede(actor, 'elemento.editar', { proyecto, elemento }),
          papelera: puede(actor, 'elemento.papelera', { proyecto, elemento }),
          cambiarVisibilidad: puede(actor, 'elemento.cambiarVisibilidad', { proyecto, elemento }),
        },
      };
    });
  });

  app.patch<{ Params: { id: string } }>('/api/v1/elementos/:id', async (req) => {
    const actor = exigirCuenta(req);
    const datos = leer(edicion, req.body);
    return conCuenta(actor.ctx, async (tx) => ({ elemento: await editarElemento(tx, actor, req.params.id, datos) }));
  });

  app.post<{ Params: { id: string } }>('/api/v1/elementos/:id/papelera', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, async (tx) => ({ elemento: await papeleraElemento(tx, actor, req.params.id) }));
  });

  app.post<{ Params: { id: string } }>('/api/v1/elementos/:id/restaurar', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, async (tx) => ({ elemento: await restaurarElemento(tx, actor, req.params.id) }));
  });

  /**
   * Papelera del proyecto (owner/admin): lo borrado cuyo padre sigue activo. Al restaurar
   * algo, vuelve con todo lo que tenía dentro.
   */
  app.get<{ Params: { id: string } }>('/api/v1/proyectos/:id/papelera', async (req) => {
    const actor = exigirCuenta(req);
    return conCuenta(actor.ctx, async (tx) => {
      const proyecto = await proyectoPara(tx, actor, req.params.id, 'proyecto.verPapelera', 'Solo dueños y administradores ven la papelera.');
      const elementos = await tx.recording.findMany({
        where: {
          projectId: proyecto.id,
          status: 'trashed',
          OR: [{ parentId: null }, { parent: { status: 'active' } }],
        },
        select: { ...SELECCION, trashedBy: { select: { id: true, name: true } } },
        orderBy: { trashedAt: 'desc' },
      });
      return { elementos };
    });
  });
}
