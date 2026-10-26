/**
 * Exportar la cuenta (día 14, D-58): un ZIP con todo lo que la cuenta tiene, para que el dueño
 * se lleve sus datos cuando quiera (y antes de cerrar la cuenta).
 *
 *   LEEME.txt
 *   cuenta.json                      cuenta, personas, lista de proyectos y plantillas
 *   proyectos/<nombre>/datos.json    todo el proyecto: listas, tareas, mensajes, comentarios,
 *                                    carpetas, archivos (con versiones) y actividad
 *   proyectos/<nombre>/tareas.csv    las tareas en una hoja de cálculo
 *   proyectos/<nombre>/mensajes/…    cada mensaje como página HTML
 *   proyectos/<nombre>/archivos/…    los archivos con su carpeta; versiones viejas como "(v1)"
 *
 * Incluye lo archivado y lo que está en la papelera (marcado con su estado): es una copia
 * completa, no la vista de alguien. Solo el dueño de la cuenta la puede pedir.
 *
 * Los datos se leen proyecto por proyecto (transacciones cortas) y los archivos se van
 * escribiendo al ZIP mientras se descarga, sin cargarlos en memoria.
 */
import yazl from 'yazl';
import { almacen } from '../lib/almacen.js';
import { conCuenta } from '../lib/contexto.js';
import { nombreLimpio } from '../lib/tipos-archivo.js';
import { leerCampos, valorPublico } from './campos.js';
/** Nombre seguro para una carpeta o archivo dentro del ZIP. */
export function nombreZip(crudo, porDefecto = 'sin-nombre') {
    const n = nombreLimpio(crudo).replace(/[<>:"/\\|?*]/g, '-').replace(/^\.+/, '').trim();
    return n.slice(0, 120) || porDefecto;
}
/** Evita dos entradas con el mismo nombre: "a.png", "a (2).png"… */
export function unicos() {
    const usados = new Set();
    return (ruta) => {
        if (!usados.has(ruta.toLowerCase())) {
            usados.add(ruta.toLowerCase());
            return ruta;
        }
        const punto = ruta.lastIndexOf('.');
        const conExt = punto > ruta.lastIndexOf('/') + 1;
        const [base, ext] = conExt ? [ruta.slice(0, punto), ruta.slice(punto)] : [ruta, ''];
        for (let i = 2;; i++) {
            const otra = `${base} (${i})${ext}`;
            if (!usados.has(otra.toLowerCase())) {
                usados.add(otra.toLowerCase());
                return otra;
            }
        }
    };
}
const celda = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Evita que una hoja de cálculo interprete fórmulas (=, +, -, @).
    const seguro = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
};
const escapar = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fecha = (d) => (d ? d.toISOString() : null);
async function leerCuenta(ctx) {
    return conCuenta(ctx, async (tx) => {
        const cuenta = await tx.account.findUniqueOrThrow({
            where: { id: ctx.accountId },
            select: { id: true, name: true, slug: true, plan: true, timeZone: true, createdAt: true },
        });
        const personas = await tx.membership.findMany({
            where: { accountId: ctx.accountId },
            select: { role: true, status: true, company: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
            orderBy: { createdAt: 'asc' },
        });
        const proyectos = await tx.project.findMany({
            where: { accountId: ctx.accountId },
            select: { id: true, name: true, description: true, status: true, createdAt: true, archivedAt: true, trashedAt: true, members: { select: { userId: true } } },
            orderBy: { createdAt: 'asc' },
        });
        const plantillas = await tx.listTemplate.findMany({
            where: { accountId: ctx.accountId },
            select: {
                id: true,
                name: true,
                description: true,
                listTitle: true,
                folderPath: true,
                folderVisibleToClients: true,
                createdAt: true,
                updatedAt: true,
                items: { select: { title: true, notes: true, audience: true, dayOffset: true }, orderBy: { position: 'asc' } },
                recurrences: { where: { active: true }, select: { projectId: true, dayOfMonth: true, nextRunOn: true } },
            },
            orderBy: { name: 'asc' },
        });
        return { cuenta, personas, proyectos, plantillas };
    });
}
async function leerProyecto(ctx, projectId) {
    return conCuenta(ctx, async (tx) => {
        const [elementos, eventos] = await Promise.all([
            tx.recording.findMany({
                where: { projectId },
                select: {
                    id: true,
                    type: true,
                    parentId: true,
                    title: true,
                    bodyHtml: true,
                    bodyText: true,
                    visibleToClients: true,
                    status: true,
                    position: true,
                    creatorId: true,
                    createdAt: true,
                    updatedAt: true,
                    trashedAt: true,
                    todo: { select: { dueOn: true, startsOn: true, completedAt: true, completedById: true, fields: true, columnId: true, steps: true } },
                    board: { select: { enabled: true, columns: true } },
                    answers: { select: { fieldId: true, value: true, answeredById: true, answeredAt: true } },
                    attachments: { select: { blob: { select: { id: true, filename: true, storageKey: true, createdAt: true } } } },
                    assignees: { select: { userId: true } },
                    versions: {
                        select: { version: true, note: true, createdAt: true, uploadedById: true, blob: { select: { id: true, filename: true, contentType: true, byteSize: true, checksum: true, storageKey: true } } },
                        orderBy: { version: 'desc' },
                    },
                },
                orderBy: [{ createdAt: 'asc' }],
            }),
            tx.event.findMany({
                where: { projectId },
                select: { action: true, actorId: true, recordingId: true, details: true, createdAt: true },
                orderBy: { createdAt: 'asc' },
            }),
        ]);
        return { elementos, eventos };
    });
}
/**
 * Arma el ZIP. Devuelve el stream para mandarlo como respuesta; los archivos se agregan en
 * segundo plano y el ZIP se cierra al final. `log` recibe los archivos que faltaban en disco.
 */
export async function exportarCuenta(ctx, log) {
    const { cuenta, personas, proyectos, plantillas } = await leerCuenta(ctx);
    const zip = new yazl.ZipFile();
    const ruta = unicos();
    const nombreDe = new Map(personas.map((p) => [p.user.id, p.user.name]));
    const faltan = [];
    zip.addBuffer(Buffer.from(JSON.stringify({
        exportado: new Date().toISOString(),
        cuenta,
        personas: personas.map((p) => ({ ...p.user, rol: p.role, estado: p.status, empresa: p.company, desde: p.createdAt })),
        proyectos: proyectos.map((p) => ({ ...p, members: undefined, personas: p.members.map((m) => m.userId) })),
        plantillas,
    }, null, 2)), ruta('cuenta.json'));
    const tareas = async () => {
        for (const p of proyectos) {
            const carpeta = ruta(`proyectos/${nombreZip(p.name, 'proyecto')}`);
            const { elementos, eventos } = await leerProyecto(ctx, p.id);
            const porId = new Map(elementos.map((e) => [e.id, e]));
            const rutaCarpeta = (id) => {
                const partes = [];
                let actual = id ? porId.get(id) : undefined;
                for (let i = 0; actual && actual.type === 'folder' && i < 50; i++) {
                    partes.unshift(nombreZip(actual.title ?? 'carpeta'));
                    actual = actual.parentId ? porId.get(actual.parentId) : undefined;
                }
                return partes.join('/');
            };
            // Archivos: la vigente con su nombre, las anteriores con "(vN)".
            const enZip = new Map(); // blobId → ruta dentro del ZIP
            for (const e of elementos.filter((x) => x.type === 'upload')) {
                const dir = [carpeta, 'archivos', rutaCarpeta(e.parentId)].filter(Boolean).join('/');
                for (const [i, v] of e.versions.entries()) {
                    const nombre = nombreZip(i === 0 ? (e.title ?? v.blob.filename) : v.blob.filename, 'archivo');
                    const punto = nombre.lastIndexOf('.');
                    const final = i === 0 ? nombre : punto > 0 ? `${nombre.slice(0, punto)} (v${v.version})${nombre.slice(punto)}` : `${nombre} (v${v.version})`;
                    const destino = ruta(`${dir}/${e.status === 'trashed' ? 'papelera/' : ''}${final}`);
                    if (await almacen().existe(v.blob.storageKey)) {
                        zip.addReadStream(almacen().leer(v.blob.storageKey), destino, { compress: false, mtime: v.createdAt });
                        enZip.set(v.blob.id, destino);
                    }
                    else {
                        faltan.push(destino);
                        log?.(`Exportar: falta en disco ${v.blob.storageKey}`);
                    }
                }
            }
            // Ficha del cliente (D-65): archivos de las respuestas en ficha/<tarea>/.
            for (const t of elementos.filter((x) => x.type === 'todo' && x.attachments.length)) {
                const dir = `${carpeta}/ficha/${nombreZip(t.title ?? 'tarea')}`;
                for (const a of t.attachments) {
                    const destino = ruta(`${dir}/${nombreZip(a.blob.filename, 'archivo')}`);
                    if (await almacen().existe(a.blob.storageKey)) {
                        zip.addReadStream(almacen().leer(a.blob.storageKey), destino, { compress: false, mtime: a.blob.createdAt });
                        enZip.set(a.blob.id, destino);
                    }
                    else {
                        faltan.push(destino);
                        log?.(`Exportar: falta en disco ${a.blob.storageKey}`);
                    }
                }
            }
            const conFicha = elementos.filter((x) => x.type === 'todo' && x.status === 'active' && leerCampos(x.todo?.fields).length);
            if (conFicha.length) {
                const valorHtml = (v) => typeof v === 'string'
                    ? escapar(v).replace(/\n/g, '<br>')
                    : v && typeof v === 'object' && !Array.isArray(v)
                        ? `<span class="meta">Acceso protegido${valorPublico(v).proveedor ? ` (${escapar(valorPublico(v).proveedor)})` : ''}: no se exporta</span>`
                        : Array.isArray(v)
                            ? v
                                .map((x) => x.url ? `${escapar(x.url)}${x.nota ? ` · ${escapar(x.nota)}` : ''}` : x.blobId ? escapar(enZip.get(x.blobId)?.split('/').slice(-1)[0] ?? 'archivo') : '')
                                .join('<br>')
                            : '';
                const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ficha · ${escapar(p.name)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 16px;line-height:1.55;color:#1d2433}dt{font-weight:600;margin-top:8px}dd{margin:0}.meta{color:#667085;font-size:14px}</style></head><body>
<h1>Ficha · ${escapar(p.name)}</h1>
${conFicha
                    .map((t) => {
                    const r = new Map(t.answers.map((a) => [a.fieldId, a]));
                    return `<h2>${escapar(t.title ?? '')}</h2><dl>${leerCampos(t.todo?.fields)
                        .map((c) => `<dt>${escapar(c.etiqueta)}</dt><dd>${r.has(c.id) ? valorHtml(r.get(c.id).value) : '<span class="meta">sin responder</span>'}</dd>`)
                        .join('')}</dl>`;
                })
                    .join('\n')}
</body></html>`;
                zip.addBuffer(Buffer.from(html), ruta(`${carpeta}/ficha.html`));
            }
            const datos = {
                proyecto: { ...p, members: undefined, personas: p.members.map((m) => m.userId) },
                elementos: elementos.map((e) => ({
                    ...e,
                    todo: e.todo ?? undefined,
                    assignees: e.assignees.map((a) => a.userId),
                    attachments: undefined,
                    // Los accesos protegidos no se exportan (D-66): solo el proveedor.
                    answers: e.answers.length ? e.answers.map((a) => ({ ...a, value: valorPublico(a.value) })) : undefined,
                    versions: e.versions.map((v) => ({
                        version: v.version,
                        nota: v.note,
                        subidoPor: v.uploadedById,
                        fecha: v.createdAt,
                        nombre: v.blob.filename,
                        tipo: v.blob.contentType,
                        bytes: Number(v.blob.byteSize),
                        sha256: v.blob.checksum,
                        enElZip: enZip.get(v.blob.id) ?? null,
                    })),
                })),
                actividad: eventos,
            };
            zip.addBuffer(Buffer.from(JSON.stringify(datos, null, 2)), ruta(`${carpeta}/datos.json`));
            // Tareas en CSV (separado por comas, UTF-8 con BOM para que Excel lea bien las tildes).
            const filas = [['Lista', 'Tarea', 'Estado', 'Vence', 'Responsables', 'Completada', 'Visible para el cliente', 'Creada por', 'Creada'].join(',')];
            for (const t of elementos.filter((x) => x.type === 'todo')) {
                const lista = t.parentId ? porId.get(t.parentId) : undefined;
                filas.push([
                    lista?.title,
                    t.title,
                    t.status === 'active' && lista?.status !== 'trashed' ? (t.todo?.completedAt ? 'completada' : 'pendiente') : 'en la papelera',
                    t.todo?.dueOn?.toISOString().slice(0, 10),
                    t.assignees.map((a) => nombreDe.get(a.userId) ?? a.userId).join(' / '),
                    fecha(t.todo?.completedAt),
                    t.visibleToClients && lista?.visibleToClients ? 'sí' : 'no',
                    nombreDe.get(t.creatorId) ?? t.creatorId,
                    fecha(t.createdAt),
                ]
                    .map(celda)
                    .join(','));
            }
            if (filas.length > 1)
                zip.addBuffer(Buffer.from('﻿' + filas.join('\r\n') + '\r\n'), ruta(`${carpeta}/tareas.csv`));
            // Mensajes como páginas (con sus comentarios), para leerlos sin programas.
            for (const m of elementos.filter((x) => x.type === 'message')) {
                const comentarios = elementos.filter((c) => c.type === 'comment' && c.parentId === m.id && c.status === 'active');
                const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapar(m.title ?? 'Mensaje')}</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 16px;line-height:1.55;color:#1d2433}.meta{color:#667085;font-size:14px}article{border-top:1px solid #e4e7ec;padding-top:12px;margin-top:16px}</style></head><body>
<h1>${escapar(m.title ?? 'Mensaje')}</h1>
<p class="meta">${escapar(nombreDe.get(m.creatorId) ?? '')} · ${m.createdAt.toISOString().slice(0, 10)}${m.status === 'trashed' ? ' · en la papelera' : ''}</p>
${m.bodyHtml ?? ''}
${comentarios.map((c) => `<article><p class="meta">${escapar(nombreDe.get(c.creatorId) ?? '')} · ${c.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</p>${c.bodyHtml ?? ''}</article>`).join('\n')}
</body></html>`;
                zip.addBuffer(Buffer.from(html), ruta(`${carpeta}/mensajes/${nombreZip(m.title ?? 'mensaje')}.html`));
            }
        }
        zip.addBuffer(Buffer.from([
            `Exportación de la cuenta «${cuenta.name}» (${new Date().toISOString().slice(0, 10)}).`,
            '',
            'cuenta.json: la cuenta, sus personas, sus proyectos y sus plantillas.',
            'ficha.html (en cada proyecto que la tenga): lo que respondió el cliente; sus archivos, en ficha/.',
            'proyectos/<nombre>/datos.json: todo el proyecto (listas, tareas, mensajes, comentarios, carpetas,',
            '  archivos con sus versiones y la actividad). Los ids de personas están en cuenta.json.',
            'proyectos/<nombre>/tareas.csv: las tareas, para abrir en Excel o Google Sheets.',
            'proyectos/<nombre>/mensajes/: cada mensaje con sus comentarios, como página para abrir en el navegador.',
            'proyectos/<nombre>/archivos/: los archivos con sus carpetas. Las versiones anteriores llevan "(vN)";',
            '  lo que estaba en la papelera, en una subcarpeta "papelera".',
            '',
            'Se incluye lo archivado y lo que estaba en la papelera, con su estado.',
            ...(faltan.length ? ['', `Archivos que no se encontraron en el servidor (${faltan.length}):`, ...faltan.map((f) => `  ${f}`)] : []),
            '',
        ].join('\r\n')), ruta('LEEME.txt'));
        zip.end();
    };
    tareas().catch((e) => {
        log?.(`Exportar: ${e instanceof Error ? e.message : String(e)}`);
        zip.outputStream.destroy(e instanceof Error ? e : new Error(String(e)));
    });
    return { stream: zip.outputStream, nombre: `${cuenta.slug}-exportacion-${new Date().toISOString().slice(0, 10)}.zip` };
}
