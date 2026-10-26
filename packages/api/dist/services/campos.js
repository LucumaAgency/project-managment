import { esCliente } from '@lucuma-pm/shared';
import { Prisma } from '@prisma/client';
import { conCuenta } from '../lib/contexto.js';
import { auditar } from '../lib/auditoria.js';
import { cifrar, descifrar } from '../lib/cifrado.js';
import { enlaceSeguro } from '../lib/documento.js';
import { HttpError } from '../lib/errores.js';
import { conBytes, crearBlob, exigirCupo } from './archivos.js';
import { avisar, seguidoresComo } from './avisos.js';
import { crearElemento, elementoPara } from './elementos.js';
import { registrarEvento } from './eventos.js';
import { exigir, puede } from './permisos.js';
import { proyectoPara } from './proyectos.js';
export const TIPOS_CAMPO = ['texto', 'parrafo', 'archivo', 'enlaces', 'acceso'];
export const MAX_CAMPOS = 20;
const MAX_ARCHIVOS = 20;
const MAX_ENLACES = 30;
const LARGO = { texto: 500, parrafo: 5000 };
/** Lo guardado en la base → campos (lo que no tenga forma de campo se ignora). */
export function leerCampos(json) {
    if (!Array.isArray(json))
        return [];
    return json.filter((c) => !!c && typeof c === 'object' && typeof c.id === 'string' && typeof c.etiqueta === 'string' && TIPOS_CAMPO.includes(c.tipo));
}
/**
 * Valida los campos que llegan del navegador. Los que ya existían conservan su id (así no se
 * pierden sus respuestas); los nuevos reciben el siguiente (c1, c2…). Lista vacía = null.
 */
export function normalizarCampos(entrada, existentes = []) {
    if (entrada === null || entrada === undefined)
        return null;
    if (!Array.isArray(entrada))
        throw new HttpError(400, 'Los campos van como una lista.');
    if (entrada.length > MAX_CAMPOS)
        throw new HttpError(400, `Una tarea pide como máximo ${MAX_CAMPOS} cosas.`);
    const usados = new Set();
    let siguiente = Math.max(0, ...existentes.map((c) => Number(/^c(\d+)$/.exec(c.id)?.[1] ?? 0))) + 1;
    const campos = [];
    for (const c of entrada) {
        const etiqueta = typeof c?.etiqueta === 'string' ? c.etiqueta.trim() : '';
        if (!etiqueta)
            throw new HttpError(400, 'Cada cosa que se pide necesita un nombre (ej.: "RUC").');
        if (etiqueta.length > 120)
            throw new HttpError(400, 'El nombre de un campo tiene como máximo 120 caracteres.');
        if (!TIPOS_CAMPO.includes(c.tipo))
            throw new HttpError(400, 'El tipo de un campo es texto, párrafo, archivo o enlaces.');
        const ayuda = typeof c.ayuda === 'string' ? c.ayuda.trim().slice(0, 300) : '';
        let id = typeof c.id === 'string' && /^c\d{1,4}$/.test(c.id) && !usados.has(c.id) ? c.id : '';
        if (!id) {
            while (usados.has(`c${siguiente}`))
                siguiente++;
            id = `c${siguiente++}`;
        }
        usados.add(id);
        const tipo = c.tipo;
        // La carpeta no la elige quien edita: se conserva la que puso la plantilla al agregarse.
        const carpetaId = tipo === 'archivo' ? existentes.find((x) => x.id === id && x.tipo === 'archivo')?.carpetaId : undefined;
        campos.push({
            id,
            etiqueta,
            tipo,
            obligatorio: c.obligatorio !== false,
            ...(ayuda ? { ayuda } : {}),
            ...(tipo === 'archivo' && c.aCarpeta === true ? { aCarpeta: true } : {}),
            ...(carpetaId && c.aCarpeta !== false ? { carpetaId } : {}),
        });
    }
    return campos.length ? campos : null;
}
export const columnaCampos = (campos) => (campos ? campos : Prisma.DbNull);
const esAcceso = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && typeof v.cifrado === 'string';
/**
 * Lo que se puede mostrar de una respuesta. Un acceso NUNCA sale con su texto cifrado: solo el
 * proveedor y que está protegido (para verlo está verAcceso, que deja registro).
 */
export function valorPublico(v) {
    return esAcceso(v) ? { proveedor: v.proveedor, protegido: true } : v;
}
const vacio = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
/** Valida y limpia una respuesta. Devuelve null si quedó vacía (= borrar la respuesta). */
function limpiarValor(campo, valor, adjuntos) {
    if (vacio(valor))
        return null;
    switch (campo.tipo) {
        case 'texto':
        case 'parrafo': {
            if (typeof valor !== 'string')
                throw new HttpError(400, `«${campo.etiqueta}» va como texto.`);
            const t = campo.tipo === 'texto' ? valor.replace(/\s+/g, ' ').trim() : valor.trim();
            if (t.length > LARGO[campo.tipo])
                throw new HttpError(400, `«${campo.etiqueta}» tiene como máximo ${LARGO[campo.tipo]} caracteres.`);
            return t || null;
        }
        case 'enlaces': {
            if (!Array.isArray(valor))
                throw new HttpError(400, `«${campo.etiqueta}» va como una lista de enlaces.`);
            if (valor.length > MAX_ENLACES)
                throw new HttpError(400, `«${campo.etiqueta}»: como máximo ${MAX_ENLACES} enlaces.`);
            const enlaces = [];
            for (const e of valor) {
                const crudo = typeof e?.url === 'string' ? e.url.trim() : '';
                if (!crudo)
                    continue;
                const url = enlaceSeguro(/^[a-z][a-z0-9+.-]*:/i.test(crudo) ? crudo : `https://${crudo}`);
                if (!url || url.startsWith('mailto:'))
                    throw new HttpError(400, `«${crudo.slice(0, 60)}» no es un enlace web.`);
                const nota = typeof e.nota === 'string' ? e.nota.trim().slice(0, 300) : '';
                enlaces.push({ url, ...(nota ? { nota } : {}) });
            }
            return enlaces.length ? enlaces : null;
        }
        case 'acceso': {
            if (!valor || typeof valor !== 'object' || Array.isArray(valor))
                throw new HttpError(400, `«${campo.etiqueta}» va como un acceso.`);
            const o = valor;
            const texto = (k, max) => (typeof o[k] === 'string' ? o[k].trim().slice(0, max) : '');
            const proveedor = texto('proveedor', 120);
            const datos = {};
            for (const [k, max] of [['url', 500], ['usuario', 200], ['clave', 500], ['notas', 1000]]) {
                const t = k === 'clave' && typeof o.clave === 'string' ? o.clave.slice(0, max) : texto(k, max);
                if (t)
                    datos[k] = t;
            }
            if (!datos.usuario && !datos.clave && !datos.notas && !datos.url)
                return null;
            return { proveedor: proveedor || null, cifrado: cifrar(datos) };
        }
        case 'archivo': {
            if (!Array.isArray(valor))
                throw new HttpError(400, `«${campo.etiqueta}» va como una lista de archivos.`);
            const ids = [...new Set(valor.map((a) => a?.blobId).filter((x) => typeof x === 'string'))];
            // Solo archivos ya subidos a ESTA tarea: no se puede apuntar a un blob ajeno.
            if (ids.some((id) => !adjuntos.has(id)))
                throw new HttpError(400, 'Ese archivo no es de esta tarea.');
            return ids.length ? ids.map((blobId) => ({ blobId })) : null;
        }
    }
}
/** ¿Están todos los obligatorios? */
export function completa(campos, respondidos) {
    return campos.length > 0 && campos.filter((c) => c.obligatorio).every((c) => respondidos.has(c.id));
}
/** Respuestas de varias tareas, con los datos de cada archivo y de quién respondió. */
export async function respuestasDe(tx, tareaIds) {
    if (!tareaIds.length)
        return new Map();
    const filas = await tx.taskAnswer.findMany({
        where: { recordingId: { in: tareaIds } },
        select: { recordingId: true, fieldId: true, value: true, answeredAt: true, answeredById: true },
    });
    const blobIds = filas.flatMap((f) => (Array.isArray(f.value) ? f.value.flatMap((v) => (v?.blobId ? [v.blobId] : [])) : []));
    const [blobs, personas] = await Promise.all([
        blobIds.length
            ? tx.blob.findMany({ where: { id: { in: blobIds }, status: 'ready' }, select: { id: true, filename: true, contentType: true, byteSize: true } })
            : [],
        tx.user.findMany({ where: { id: { in: [...new Set(filas.map((f) => f.answeredById))] } }, select: { id: true, name: true } }),
    ]);
    const blob = new Map(blobs.map((b) => [b.id, { blobId: b.id, nombre: b.filename, tipo: b.contentType, bytes: Number(b.byteSize) }]));
    const nombre = new Map(personas.map((p) => [p.id, p.name]));
    const porTarea = new Map();
    for (const f of filas) {
        let valor = f.value;
        if (Array.isArray(valor) && valor.some((v) => v && typeof v === 'object' && 'blobId' in v)) {
            valor = valor.flatMap((v) => (blob.has(v.blobId) ? [blob.get(v.blobId)] : []));
        }
        if (!porTarea.has(f.recordingId))
            porTarea.set(f.recordingId, new Map());
        porTarea.get(f.recordingId).set(f.fieldId, { valor: valorPublico(valor), respondidoEl: f.answeredAt, respondidoPor: { id: f.answeredById, name: nombre.get(f.answeredById) ?? '' } });
    }
    return porTarea;
}
/** Campos de una tarea con su respuesta, en orden. */
export function camposConRespuestas(campos, respuestas) {
    return campos.map((c) => ({ ...c, respuesta: respuestas?.get(c.id) ?? null }));
}
async function cargarTarea(tx, actor, id) {
    const { proyecto, elemento } = await elementoPara(tx, actor, id, 'elemento.ver');
    if (elemento.type !== 'todo')
        throw new HttpError(404, 'No encontrado.');
    const detalle = await tx.todoDetail.findUnique({ where: { recordingId: id }, select: { fields: true, completedAt: true } });
    return { proyecto, elemento, campos: leerCampos(detalle?.fields), completada: !!detalle?.completedAt };
}
/** Responde quien puede completar la tarea: el equipo, o el cliente si es suya. */
async function exigirResponder(tx, actor, proyecto, elemento) {
    const esAsignado = !!(await tx.todoAssignee.findUnique({ where: { recordingId_userId: { recordingId: elemento.id, userId: actor.ctx.userId } } }));
    exigir(actor, 'tarea.completar', { proyecto, elemento, esAsignado }, 'Solo quien tiene la tarea (o el equipo) puede responder.');
}
export async function puedeResponder(tx, actor, proyecto, elemento) {
    const esAsignado = !!(await tx.todoAssignee.findUnique({ where: { recordingId_userId: { recordingId: elemento.id, userId: actor.ctx.userId } } }));
    return puede(actor, 'tarea.completar', { proyecto, elemento, esAsignado });
}
/**
 * Guarda respuestas (solo los campos que vienen; vacío = borrar esa respuesta). Si con esto
 * quedan todos los obligatorios, completa la tarea. `completar` lo hace tareas.ts para no
 * depender en círculo.
 */
export async function responder(tx, actor, tareaId, respuestas, completar) {
    const { proyecto, elemento, campos, completada } = await cargarTarea(tx, actor, tareaId);
    if (!campos.length)
        throw new HttpError(400, 'Esta tarea no pide nada.');
    await exigirResponder(tx, actor, proyecto, elemento);
    const porId = new Map(campos.map((c) => [c.id, c]));
    const desconocido = Object.keys(respuestas).find((k) => !porId.has(k));
    if (desconocido)
        throw new HttpError(400, 'Uno de los campos ya no existe: recarga la tarea.');
    const adjuntos = new Set((await tx.recordingAttachment.findMany({ where: { recordingId: tareaId }, select: { blobId: true } })).map((a) => a.blobId));
    const cambiaron = [];
    for (const [fieldId, crudo] of Object.entries(respuestas)) {
        const campo = porId.get(fieldId);
        const valor = limpiarValor(campo, crudo, adjuntos);
        const antes = await tx.taskAnswer.findUnique({ where: { recordingId_fieldId: { recordingId: tareaId, fieldId } }, select: { value: true } });
        if (JSON.stringify(antes?.value ?? null) === JSON.stringify(valor))
            continue;
        // Un acceso no se borra sin querer: vacío = se deja el que había (para quitarlo, { borrar: true }).
        if (campo.tipo === 'acceso' && valor === null && !(crudo && typeof crudo === 'object' && crudo.borrar === true))
            continue;
        if (valor === null)
            await tx.taskAnswer.deleteMany({ where: { recordingId: tareaId, fieldId } });
        else {
            await tx.taskAnswer.upsert({
                where: { recordingId_fieldId: { recordingId: tareaId, fieldId } },
                create: { accountId: actor.ctx.accountId, recordingId: tareaId, fieldId, value: valor, answeredById: actor.ctx.userId },
                update: { value: valor, answeredById: actor.ctx.userId, answeredAt: new Date() },
            });
        }
        cambiaron.push(campo.etiqueta);
    }
    await soltarArchivosSinUso(tx, tareaId);
    if (cambiaron.length) {
        const eventId = await registrarEvento(tx, {
            accountId: actor.ctx.accountId,
            projectId: proyecto.id,
            recordingId: tareaId,
            actorId: actor.ctx.userId,
            action: 'answered',
            details: { campos: cambiaron },
            visibleToClients: elemento.visibleEnCadena,
        });
        await avisar(tx, {
            accountId: actor.ctx.accountId,
            eventId,
            recordingId: tareaId,
            actorId: actor.ctx.userId,
            visibleToClients: elemento.visibleEnCadena,
            destinatarios: await seguidoresComo(tx, tareaId),
        });
    }
    const respondidos = new Set((await tx.taskAnswer.findMany({ where: { recordingId: tareaId }, select: { fieldId: true } })).map((r) => r.fieldId));
    const seCompleto = !completada && completa(campos, respondidos);
    if (seCompleto)
        await completar(tx, actor, tareaId);
    return { cambiaron, seCompleto };
}
/** Archivos de la tarea que ya no están en ninguna respuesta: se sueltan (la purga los borra). */
async function soltarArchivosSinUso(tx, tareaId) {
    const [adjuntos, respuestas] = await Promise.all([
        tx.recordingAttachment.findMany({ where: { recordingId: tareaId }, select: { blobId: true } }),
        tx.taskAnswer.findMany({ where: { recordingId: tareaId }, select: { value: true } }),
    ]);
    const enUso = new Set(respuestas.flatMap((r) => (Array.isArray(r.value) ? r.value.flatMap((v) => (v?.blobId ? [v.blobId] : [])) : [])));
    const sueltos = adjuntos.map((a) => a.blobId).filter((id) => !enUso.has(id));
    if (sueltos.length)
        await tx.recordingAttachment.deleteMany({ where: { recordingId: tareaId, blobId: { in: sueltos } } });
}
/**
 * Cambia lo que pide una tarea (solo el equipo). Las respuestas de los campos que se quitan (o
 * cambian de tipo) se borran con sus archivos.
 */
export async function fijarCampos(tx, actor, tareaId, entrada) {
    const { proyecto, elemento, campos: antes } = await cargarTarea(tx, actor, tareaId);
    if (esCliente(actor.rol))
        throw new HttpError(403, 'Lo que pide una tarea lo define el equipo.');
    exigir(actor, 'elemento.editar', { proyecto, elemento }, 'No puedes editar esta tarea.');
    const campos = normalizarCampos(entrada, antes);
    await tx.todoDetail.upsert({
        where: { recordingId: tareaId },
        create: { recordingId: tareaId, fields: columnaCampos(campos) },
        update: { fields: columnaCampos(campos) },
    });
    // Se borran las respuestas de los campos que se quitan y de los que cambian de tipo (un
    // texto no sirve como lista de archivos).
    const quedan = new Map((campos ?? []).map((c) => [c.id, c.tipo]));
    const quitados = antes.filter((c) => quedan.get(c.id) !== c.tipo).map((c) => c.id);
    if (quitados.length) {
        await tx.taskAnswer.deleteMany({ where: { recordingId: tareaId, fieldId: { in: quitados } } });
        await soltarArchivosSinUso(tx, tareaId);
    }
}
/**
 * Sube un archivo a un campo de tipo archivo y lo suma a su respuesta. Tres pasos como en
 * archivos.ts: permiso, bytes fuera de la base, registro.
 */
export async function subirArchivoCampo(actor, tareaId, campoId, nombre, entrada, completar) {
    const campo = await conCuenta(actor.ctx, async (tx) => {
        const { proyecto, elemento, campos } = await cargarTarea(tx, actor, tareaId);
        await exigirResponder(tx, actor, proyecto, elemento);
        const c = campos.find((x) => x.id === campoId);
        if (!c || c.tipo !== 'archivo')
            throw new HttpError(404, 'Ese campo no recibe archivos.');
        const ya = await tx.recordingAttachment.count({ where: { recordingId: tareaId } });
        if (ya >= MAX_ARCHIVOS * MAX_CAMPOS)
            throw new HttpError(400, 'Esta tarea ya tiene demasiados archivos.');
        await exigirCupo(tx, actor.ctx.accountId, 1);
        return c;
    });
    return conBytes(actor, entrada, nombre, (g) => conCuenta(actor.ctx, async (tx) => {
        const blob = await crearBlob(tx, actor, g);
        await tx.recordingAttachment.create({ data: { recordingId: tareaId, blobId: blob.id } });
        const actual = await tx.taskAnswer.findUnique({ where: { recordingId_fieldId: { recordingId: tareaId, fieldId: campoId } }, select: { value: true } });
        const lista = Array.isArray(actual?.value) ? actual.value : [];
        if (lista.length >= MAX_ARCHIVOS)
            throw new HttpError(400, `«${campo.etiqueta}»: como máximo ${MAX_ARCHIVOS} archivos.`);
        const enCarpeta = campo.carpetaId ? await guardarEnCarpeta(tx, actor, campo.carpetaId, blob.id, g.nombre) : null;
        const r = await responder(tx, actor, tareaId, { [campoId]: [...lista, { blobId: blob.id }] }, completar);
        return { blobId: blob.id, nombre: g.nombre, ...(enCarpeta ? { archivoId: enCarpeta } : {}), ...r };
    }));
}
/**
 * Copia en la carpeta de la plantilla (D-73): un archivo nuevo en Archivos con el mismo blob
 * (no ocupa espacio dos veces). Si quitan el archivo de la respuesta, en la carpeta se queda: el
 * blob sigue en uso por la versión y la purga no lo toca. Si la carpeta ya no existe o quien sube
 * no puede crear ahí, solo queda en la tarea.
 */
async function guardarEnCarpeta(tx, actor, carpetaId, blobId, nombre) {
    const c = await tx.recording.findFirst({ where: { id: carpetaId, type: 'folder', status: 'active' }, select: { projectId: true } });
    if (!c)
        return null;
    let cargado;
    try {
        cargado = await elementoPara(tx, actor, carpetaId, 'elemento.ver');
    }
    catch {
        return null;
    }
    if (cargado.elemento.padreInactivo || !puede(actor, 'elemento.crear', { proyecto: cargado.proyecto, elemento: cargado.elemento, tipo: 'upload' }))
        return null;
    const archivo = await crearElemento(tx, actor, c.projectId, { type: 'upload', parentId: carpetaId, title: nombre, visibleToClients: cargado.elemento.visibleEnCadena });
    await tx.uploadVersion.create({ data: { recordingId: archivo.id, blobId, version: 1, uploadedById: actor.ctx.userId } });
    return archivo.id;
}
/**
 * Ficha del cliente: todo lo respondido en el proyecto, agrupado por tarea, en el orden de
 * las listas. Cada quien ve solo las tareas que puede ver (el cliente, las visibles).
 */
export async function fichaProyecto(tx, actor, projectId) {
    const proyecto = await proyectoPara(tx, actor, projectId, 'proyecto.ver');
    const cliente = esCliente(actor.rol);
    const visibles = cliente ? { visibleToClients: true } : {};
    const listas = await tx.recording.findMany({
        where: { projectId, type: 'todolist', parentId: null, status: 'active', ...visibles },
        select: { id: true, title: true },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    const tareas = await tx.recording.findMany({
        where: { projectId, type: 'todo', status: 'active', parentId: { in: listas.map((l) => l.id) }, todo: { fields: { not: Prisma.DbNull } }, ...visibles },
        select: { id: true, parentId: true, title: true, todo: { select: { fields: true, completedAt: true } } },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    const respuestas = await respuestasDe(tx, tareas.map((t) => t.id));
    const orden = new Map(listas.map((l, i) => [l.id, i]));
    const nombreLista = new Map(listas.map((l) => [l.id, l.title]));
    return {
        proyecto: { id: proyecto.id, name: proyecto.name },
        tareas: tareas
            .sort((a, b) => orden.get(a.parentId) - orden.get(b.parentId))
            .map((t) => {
            const campos = camposConRespuestas(leerCampos(t.todo?.fields), respuestas.get(t.id));
            return {
                id: t.id,
                title: t.title,
                lista: nombreLista.get(t.parentId) ?? null,
                completada: !!t.todo?.completedAt,
                respondidos: campos.filter((c) => c.respuesta).length,
                campos,
            };
        }),
    };
}
/**
 * Ver un acceso protegido (D-66): solo el equipo, y cada vez queda en el registro de seguridad
 * con quién, cuándo y cuál. El cliente que lo cargó no lo vuelve a ver.
 */
export async function verAcceso(tx, actor, tareaId, campoId, ip) {
    const { campos } = await cargarTarea(tx, actor, tareaId);
    if (esCliente(actor.rol))
        throw new HttpError(403, 'Los accesos solo los ve el equipo.');
    const campo = campos.find((c) => c.id === campoId && c.tipo === 'acceso');
    if (!campo)
        throw new HttpError(404, 'Ese campo no es un acceso.');
    const r = await tx.taskAnswer.findUnique({ where: { recordingId_fieldId: { recordingId: tareaId, fieldId: campoId } }, select: { value: true } });
    if (!r || !esAcceso(r.value))
        throw new HttpError(404, 'Todavía no hay un acceso guardado.');
    const datos = descifrar(r.value.cifrado);
    await auditar({ accountId: actor.ctx.accountId, userId: actor.ctx.userId, action: 'acceso.ver', entity: 'tarea', entityId: tareaId, ip, meta: { campoId, etiqueta: campo.etiqueta } }, tx);
    return { acceso: { proveedor: r.value.proveedor, ...datos }, vistas: await vistasDeAccesos(tx, tareaId) };
}
/** Quién vio los accesos de una tarea (lo más nuevo primero), para el equipo. */
export async function vistasDeAccesos(tx, tareaId) {
    const filas = await tx.auditLog.findMany({
        where: { action: 'acceso.ver', entity: 'tarea', entityId: tareaId },
        select: { userId: true, createdAt: true, meta: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
    });
    const nombres = new Map((await tx.user.findMany({ where: { id: { in: [...new Set(filas.flatMap((f) => (f.userId ? [f.userId] : [])))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return filas.map((f) => ({ campoId: f.meta?.campoId ?? null, nombre: nombres.get(f.userId ?? '') ?? 'Alguien', el: f.createdAt }));
}
