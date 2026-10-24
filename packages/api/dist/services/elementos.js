/**
 * Servicio genérico de elementos (Recording): listas, tareas, mensajes, carpetas, archivos y
 * comentarios. Crear, editar, papelera y restaurar se programan UNA vez aquí y sirven para
 * todos los tipos. Cada cambio registra su evento en la misma transacción.
 *
 * Visibilidad para clientes (la regla más delicada del producto):
 *  - Un hijo nunca es más visible que su padre: un cliente ve un elemento solo si él y toda su
 *    cadena de padres son visibles (`visibleEnCadena`).
 *  - Lo que crea un cliente nace visible.
 *  - Un comentario copia la visibilidad de lo que comenta.
 */
import { esCliente } from '@lucuma-pm/shared';
import { Prisma } from '@prisma/client';
import { documentoDesdeTexto, documentoVacio, procesarDocumento } from '../lib/documento.js';
import { HttpError } from '../lib/errores.js';
import { guardarMenciones } from './menciones.js';
import { registrarEvento } from './eventos.js';
import { exigir } from './permisos.js';
import { proyectoPara } from './proyectos.js';
/** Dentro de qué puede ir cada tipo. `null` = en la raíz del proyecto. */
export const PADRES = {
    todolist: [null],
    todo: ['todolist'],
    message: [null],
    folder: [null, 'folder'],
    upload: [null, 'folder'],
    comment: ['todolist', 'todo', 'message', 'upload'],
};
/** Los archivos se crean al confirmar una subida (día 10), no por la ruta genérica. */
export const TIPOS_CREABLES = ['todolist', 'todo', 'message', 'folder', 'comment'];
const LLEVA_TITULO = ['todolist', 'todo', 'message', 'folder', 'upload'];
/** Columnas que se devuelven a la web. */
export const SELECCION = {
    id: true,
    projectId: true,
    type: true,
    parentId: true,
    title: true,
    bodyText: true,
    bodyHtml: true,
    body: true,
    visibleToClients: true,
    status: true,
    position: true,
    createdAt: true,
    updatedAt: true,
    trashedAt: true,
    creator: { select: { id: true, name: true } },
};
/** El elemento y todos sus padres, del elemento hacia la raíz (pasa por RLS). */
async function cadena(tx, id) {
    return tx.$queryRaw `
    WITH RECURSIVE c AS (
      SELECT id, "parentId", "visibleToClients" AS visible, status::text, "projectId", type, "creatorId", 0 AS nivel
      FROM recordings WHERE id = ${id}
      UNION ALL
      SELECT r.id, r."parentId", r."visibleToClients", r.status::text, r."projectId", r.type, r."creatorId", c.nivel + 1
      FROM recordings r JOIN c ON r.id = c."parentId"
      WHERE c.nivel < 50
    )
    SELECT * FROM c ORDER BY nivel`;
}
function aCargado(eslabones) {
    const [e, ...padres] = eslabones;
    return {
        id: e.id,
        type: e.type,
        creatorId: e.creatorId,
        status: e.status,
        visibleEnCadena: eslabones.every((x) => x.visible),
        padreInactivo: padres.some((x) => x.status !== 'active'),
    };
}
/**
 * Carga un elemento con su proyecto y corta si la acción no se permite. Lo que no existe y lo
 * que no puedes ver (p. ej. algo interno, si eres cliente) responden igual: 404.
 */
export async function elementoPara(tx, actor, id, accion, mensaje) {
    const eslabones = await cadena(tx, id);
    if (eslabones.length === 0)
        throw new HttpError(404, 'No encontrado.');
    const proyecto = await proyectoPara(tx, actor, eslabones[0].projectId, 'proyecto.ver');
    const elemento = aCargado(eslabones);
    exigir(actor, accion, { proyecto, elemento }, mensaje);
    return { proyecto, elemento };
}
/** Visibilidad efectiva (con la cadena) de un elemento, para copiarla al evento. */
async function visibleEfectivo(tx, id) {
    return (await cadena(tx, id)).every((x) => x.visible);
}
/** Cuerpo del elemento desde el documento o el texto plano. null = sin cuerpo. */
function cuerpo(datos) {
    if (datos.body !== undefined && datos.body !== null) {
        const d = procesarDocumento(datos.body);
        return documentoVacio(d) ? null : d;
    }
    const t = datos.bodyText?.trim();
    return t ? procesarDocumento(documentoDesdeTexto(t)) : null;
}
/** Columnas de cuerpo para guardar (las tres formas del mismo texto). */
function columnasCuerpo(d) {
    return d
        ? { body: d.json, bodyHtml: d.html, bodyText: d.texto }
        : { body: Prisma.DbNull, bodyHtml: null, bodyText: null };
}
export async function crearElemento(tx, actor, projectId, datos) {
    const proyecto = await proyectoPara(tx, actor, projectId, 'proyecto.ver');
    const parentId = datos.parentId ?? null;
    let padre = null;
    if (parentId) {
        const eslabones = await cadena(tx, parentId);
        if (eslabones.length === 0 || eslabones[0].projectId !== projectId)
            throw new HttpError(404, 'No encontrado.');
        padre = { elemento: aCargado(eslabones), visible: eslabones.every((x) => x.visible) };
        if (padre.elemento.status !== 'active')
            throw new HttpError(409, 'Eso está en la papelera.');
    }
    exigir(actor, 'elemento.crear', { proyecto, elemento: padre?.elemento, tipo: datos.type }, 'Tu rol no puede crear esto aquí.');
    const tipoPadre = padre?.elemento.type ?? null;
    if (!PADRES[datos.type].includes(tipoPadre)) {
        throw new HttpError(400, `Un elemento de tipo ${datos.type} no puede ir ${tipoPadre ? `dentro de ${tipoPadre}` : 'en la raíz'}.`);
    }
    const title = datos.title?.trim() || null;
    const doc = cuerpo(datos);
    if (LLEVA_TITULO.includes(datos.type) && !title)
        throw new HttpError(400, 'Falta el título.');
    if (datos.type === 'comment' && !doc)
        throw new HttpError(400, 'El comentario está vacío.');
    // Visibilidad: el cliente crea visible; el comentario copia la de su padre; el resto elige.
    const visibleToClients = datos.type === 'comment'
        ? padre.visible
        : esCliente(actor.rol)
            ? true
            : (datos.visibleToClients ?? false);
    const ultimo = await tx.recording.aggregate({
        where: { projectId, parentId, type: datos.type },
        _max: { position: true },
    });
    const creado = await tx.recording.create({
        data: {
            accountId: actor.ctx.accountId,
            projectId,
            type: datos.type,
            parentId,
            creatorId: actor.ctx.userId,
            title: datos.type === 'comment' ? null : title,
            ...columnasCuerpo(doc),
            visibleToClients,
            position: (ultimo._max.position ?? 0) + 1,
        },
        select: SELECCION,
    });
    const visibleEnCadena = visibleToClients && (padre?.visible ?? true);
    const mencionados = doc
        ? await guardarMenciones(tx, {
            accountId: actor.ctx.accountId,
            projectId,
            recordingId: creado.id,
            ids: doc.menciones,
            visibleParaClientes: visibleEnCadena,
        })
        : [];
    await registrarEvento(tx, {
        accountId: actor.ctx.accountId,
        projectId,
        recordingId: creado.id,
        actorId: actor.ctx.userId,
        action: 'created',
        details: { type: creado.type, ...(mencionados.length ? { mencionados } : {}) },
        visibleToClients: visibleEnCadena,
    });
    return { ...creado, mencionados };
}
export async function editarElemento(tx, actor, id, datos) {
    const { proyecto, elemento } = await elementoPara(tx, actor, id, 'elemento.editar', 'Solo quien lo creó o un administrador puede editarlo.');
    const actual = await tx.recording.findUniqueOrThrow({ where: { id }, select: { title: true, bodyText: true, visibleToClients: true } });
    const cambios = {};
    let doc; // undefined = el cuerpo no cambia
    if (datos.title !== undefined) {
        if (!LLEVA_TITULO.includes(elemento.type))
            throw new HttpError(400, 'Este elemento no lleva título.');
        const t = datos.title.trim();
        if (!t)
            throw new HttpError(400, 'Falta el título.');
        cambios.title = t;
    }
    if (datos.body !== undefined || datos.bodyText !== undefined) {
        doc = cuerpo(datos);
        if (elemento.type === 'comment' && !doc)
            throw new HttpError(400, 'El comentario está vacío.');
        Object.assign(cambios, columnasCuerpo(doc));
    }
    if (datos.position !== undefined)
        cambios.position = datos.position;
    if (datos.visibleToClients !== undefined && datos.visibleToClients !== actual.visibleToClients) {
        exigir(actor, 'elemento.cambiarVisibilidad', { proyecto, elemento }, 'No puedes cambiar la visibilidad de esto.');
        cambios.visibleToClients = datos.visibleToClients;
    }
    if (Object.keys(cambios).length === 0)
        throw new HttpError(400, 'No hay nada que cambiar.');
    const editado = await tx.recording.update({ where: { id }, data: cambios, select: SELECCION });
    const visible = await visibleEfectivo(tx, id);
    let mencionados = [];
    if (doc !== undefined || cambios.visibleToClients !== undefined) {
        // Si cambió el texto o la visibilidad, las menciones se recalculan (un cliente deja de
        // contar como mencionado si el elemento pasa a interno).
        const actualDoc = doc !== undefined ? doc : editado.body ? procesarDocumento(editado.body) : null;
        mencionados = await guardarMenciones(tx, {
            accountId: actor.ctx.accountId,
            projectId: proyecto.id,
            recordingId: id,
            ids: actualDoc?.menciones ?? [],
            visibleParaClientes: visible,
        });
    }
    const base = { accountId: actor.ctx.accountId, projectId: proyecto.id, recordingId: id, actorId: actor.ctx.userId };
    if (cambios.visibleToClients !== undefined) {
        await registrarEvento(tx, { ...base, action: 'visibility_changed', details: { to: cambios.visibleToClients }, visibleToClients: visible });
    }
    if (cambios.title !== undefined || doc !== undefined) {
        await registrarEvento(tx, {
            ...base,
            action: 'updated',
            details: {
                ...(cambios.title !== undefined && cambios.title !== actual.title ? { title: { from: actual.title, to: cambios.title } } : {}),
                ...(mencionados.length ? { mencionados } : {}),
            },
            visibleToClients: visible,
        });
    }
    return { ...editado, mencionados };
}
/** A la papelera: deja de verse con todo lo que tiene dentro. Se purga a los 30 días (día 14). */
export async function papeleraElemento(tx, actor, id) {
    const { proyecto, elemento } = await elementoPara(tx, actor, id, 'elemento.papelera', 'Solo quien lo creó o un administrador puede borrarlo.');
    if (elemento.status === 'trashed')
        return tx.recording.findUniqueOrThrow({ where: { id }, select: SELECCION });
    const r = await tx.recording.update({
        where: { id },
        data: { status: 'trashed', trashedAt: new Date(), trashedById: actor.ctx.userId },
        select: SELECCION,
    });
    await registrarEvento(tx, {
        accountId: actor.ctx.accountId,
        projectId: proyecto.id,
        recordingId: id,
        actorId: actor.ctx.userId,
        action: 'trashed',
        visibleToClients: await visibleEfectivo(tx, id),
    });
    return r;
}
export async function restaurarElemento(tx, actor, id) {
    const { proyecto, elemento } = await elementoPara(tx, actor, id, 'elemento.papelera', 'Solo quien lo creó o un administrador puede restaurarlo.');
    if (elemento.status !== 'trashed')
        throw new HttpError(409, 'No está en la papelera.');
    const r = await tx.recording.update({
        where: { id },
        data: { status: 'active', trashedAt: null, trashedById: null },
        select: SELECCION,
    });
    await registrarEvento(tx, {
        accountId: actor.ctx.accountId,
        projectId: proyecto.id,
        recordingId: id,
        actorId: actor.ctx.userId,
        action: 'restored',
        visibleToClients: await visibleEfectivo(tx, id),
    });
    return r;
}
/**
 * Hijos activos de un padre (o de la raíz del proyecto), en orden. Para un cliente, solo los
 * visibles, y solo si el padre (con su cadena) también lo es.
 */
export async function listarElementos(tx, actor, proyecto, filtro) {
    if (filtro.parentId) {
        const { elemento } = await elementoPara(tx, actor, filtro.parentId, 'elemento.ver');
        if (elemento.status !== 'active')
            return [];
    }
    return tx.recording.findMany({
        where: {
            projectId: proyecto.id,
            parentId: filtro.parentId,
            status: 'active',
            ...(filtro.type ? { type: filtro.type } : {}),
            ...(esCliente(actor.rol) ? { visibleToClients: true } : {}),
        },
        select: SELECCION,
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
}
/**
 * Mueve un elemento: lo pone justo después de `despuesDe` (null = primero) dentro de
 * `parentId` (el actual si no se indica). Sirve para ordenar tareas y listas y para pasar una
 * tarea a otra lista. La posición nueva es el promedio entre sus vecinos (sin renumerar); si
 * la diferencia se vuelve demasiado chica, se renumera ese grupo.
 */
export async function moverElemento(tx, actor, id, destino) {
    const { proyecto, elemento } = await elementoPara(tx, actor, id, 'elemento.mover', 'No puedes mover esto.');
    const actual = await tx.recording.findUniqueOrThrow({ where: { id }, select: { parentId: true, type: true } });
    const parentId = destino.parentId === undefined ? actual.parentId : destino.parentId;
    if (parentId !== actual.parentId) {
        if (!parentId)
            throw new HttpError(400, 'Eso no puede quedar en la raíz.');
        const { elemento: padre } = await elementoPara(tx, actor, parentId, 'elemento.ver');
        const filaPadre = await tx.recording.findUniqueOrThrow({ where: { id: parentId }, select: { projectId: true } });
        if (filaPadre.projectId !== proyecto.id)
            throw new HttpError(404, 'No encontrado.');
        if (padre.status !== 'active')
            throw new HttpError(409, 'Eso está en la papelera.');
        if (!PADRES[elemento.type].includes(padre.type))
            throw new HttpError(400, 'No puede ir ahí.');
    }
    const hermanos = await tx.recording.findMany({
        where: { projectId: proyecto.id, parentId, type: actual.type, status: 'active', id: { not: id } },
        select: { id: true, position: true },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    let i = 0;
    if (destino.despuesDe) {
        const k = hermanos.findIndex((h) => h.id === destino.despuesDe);
        if (k === -1)
            throw new HttpError(400, 'El elemento de referencia no está en ese lugar.');
        i = k + 1;
    }
    const antes = hermanos[i - 1]?.position;
    const despues = hermanos[i]?.position;
    let posicion = antes === undefined ? (despues === undefined ? 1 : despues - 1) : despues === undefined ? antes + 1 : (antes + despues) / 2;
    if (antes !== undefined && despues !== undefined && despues - antes < 1e-6) {
        // Demasiadas inserciones en el mismo hueco: renumerar el grupo 1..n y ubicar de nuevo.
        const orden = [...hermanos.slice(0, i).map((h) => h.id), id, ...hermanos.slice(i).map((h) => h.id)];
        for (const [n, hid] of orden.entries())
            await tx.recording.update({ where: { id: hid }, data: { position: n + 1 } });
        posicion = i + 1;
    }
    const movido = await tx.recording.update({ where: { id }, data: { parentId, position: posicion }, select: SELECCION });
    await registrarEvento(tx, {
        accountId: actor.ctx.accountId,
        projectId: proyecto.id,
        recordingId: id,
        actorId: actor.ctx.userId,
        action: 'moved',
        details: parentId !== actual.parentId ? { from: actual.parentId, to: parentId } : {},
        visibleToClients: await visibleEfectivo(tx, id),
    });
    return movido;
}
