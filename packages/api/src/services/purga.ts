/**
 * Purga de la papelera (día 14, D-56): lo que lleva más de 30 días en la papelera se borra de
 * verdad, con todo lo que tenía dentro, y los archivos que ya nadie usa se borran del disco.
 *
 * Orden: primero las filas (en una transacción con la cuenta fijada) y DESPUÉS los archivos del
 * disco. Si la transacción falla, el disco queda intacto. Si falla borrar un archivo, queda un
 * archivo huérfano en disco (ocupa espacio, pero nadie lo puede pedir: ya no tiene fila).
 *
 * Corre con el latido externo y "al usar la app" (como los recordatorios). Se puede correr
 * las veces que se quiera.
 */
import { prismaAdmin } from '../db.js';
import { almacen } from '../lib/almacen.js';
import { auditar } from '../lib/auditoria.js';
import { conCuenta } from '../lib/contexto.js';

export const DIAS_PAPELERA = 30;
const DIA_MS = 86_400_000;

export interface Purgado {
  proyectos: number;
  elementos: number;
  archivos: number;
  bytes: number;
}

export async function purgarCuenta(accountId: string, ahora = new Date(), log?: (e: unknown) => void): Promise<Purgado> {
  const limite = new Date(ahora.getTime() - DIAS_PAPELERA * DIA_MS);
  // Un blob sin versión ni adjunto que tiene menos de un día puede ser una subida en curso.
  const blobViejo = new Date(ahora.getTime() - DIA_MS);

  const r = await conCuenta({ accountId, userId: '' }, async (tx) => {
    // Proyectos: borrar el proyecto borra en cascada todo lo que tiene.
    const proyectos = await tx.project.deleteMany({ where: { accountId, status: 'trashed', trashedAt: { lt: limite } } });
    // Elementos sueltos: lo de adentro se va en cascada (parentId ON DELETE CASCADE).
    const elementos = await tx.recording.deleteMany({ where: { accountId, status: 'trashed', trashedAt: { lt: limite } } });

    const huerfanos = await tx.blob.findMany({
      where: { accountId, createdAt: { lt: blobViejo }, versions: { none: {} }, attachments: { none: {} } },
      select: { id: true, storageKey: true, byteSize: true },
    });
    if (huerfanos.length) await tx.blob.deleteMany({ where: { id: { in: huerfanos.map((b) => b.id) } } });

    const res = {
      proyectos: proyectos.count,
      elementos: elementos.count,
      archivos: huerfanos.length,
      bytes: huerfanos.reduce((s, b) => s + Number(b.byteSize), 0),
    };
    if (res.proyectos || res.elementos || res.archivos) {
      await auditar({ accountId, action: 'papelera.purga', meta: res }, tx);
    }
    return { res, claves: huerfanos.map((b) => b.storageKey) };
  });

  for (const clave of r.claves) {
    try {
      await almacen().borrar(clave);
    } catch (e) {
      log?.(e);
    }
  }
  return r.res;
}

/** Todas las cuentas (latido externo). Cada una con su RLS. */
export async function purgarTodas(ahora = new Date(), log?: (e: unknown) => void) {
  const cuentas = await prismaAdmin.account.findMany({ select: { id: true } });
  const total: Purgado = { proyectos: 0, elementos: 0, archivos: 0, bytes: 0 };
  for (const c of cuentas) {
    const r = await purgarCuenta(c.id, ahora, log);
    for (const k of Object.keys(total) as (keyof Purgado)[]) total[k] += r[k];
  }
  return total;
}

/** "Al usar la app": como mucho una vez cada 6 horas por cuenta y proceso, sin hacer esperar. */
const ultimo = new Map<string, number>();
const CADA_MS = 6 * 3_600_000;
export function dispararPurga(accountId: string, log?: (e: unknown) => void) {
  const ahora = Date.now();
  if (ahora - (ultimo.get(accountId) ?? 0) < CADA_MS) return;
  ultimo.set(accountId, ahora);
  setImmediate(() => purgarCuenta(accountId, new Date(), log).catch((e) => log?.(e)));
}
export const olvidarPurgas = () => ultimo.clear();
