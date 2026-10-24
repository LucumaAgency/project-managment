/**
 * Respaldo diario de la base (día 15, D-60).
 *
 * pg_dump en formato propio (-Fc: comprimido, se restaura con pg_restore) a
 * <raíz>/privados/respaldos/base-AAAA-MM-DD.dump, más una lista de los archivos subidos
 * (archivos-AAAA-MM-DD.tsv: clave, bytes y huella) para poder comprobar después de restaurar
 * que no falta ninguno. Se guardan los últimos 14 días.
 *
 * Esto protege de errores (algo borrado, una migración que salió mal), NO de perder el
 * servidor: está en el mismo disco. La copia fuera del servidor la hace el gestor de copias de
 * Plesk (documentacion/10-DESPLIEGUE-PLESK.md §5e), que se lleva también privados/.
 *
 * Sin root no se puede instalar nada: se usa el pg_dump que ya tenga el servidor (o el de
 * PG_BIN_DIR). Si no hay, o es más viejo que el servidor de la base, lo dice y no hace nada.
 */
import { execFile, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { prismaAdmin } from '../db.js';
import { env } from '../env.js';
import { diaEn } from './recordatorios.js';
const ejecutar = promisify(execFile);
/** Dónde buscar pg_dump / pg_restore, en orden. */
async function candidatos(nombre) {
    const dirs = [];
    if (env.pgBinDir)
        dirs.push(env.pgBinDir);
    dirs.push(...(process.env.PATH ?? '').split(path.delimiter).filter(Boolean));
    dirs.push('/usr/bin', '/usr/local/bin', '/usr/local/pgsql/bin');
    // Debian/Ubuntu (/usr/lib/postgresql/16/bin) y RHEL (/usr/pgsql-16/bin): la más nueva primero.
    for (const [base, patron] of [['/usr/lib/postgresql', /^\d+$/], ['/usr', /^pgsql-\d+$/]]) {
        const hijos = await fs.readdir(base).catch(() => []);
        hijos
            .filter((h) => patron.test(h))
            .sort((a, b) => Number(b.replace(/\D/g, '')) - Number(a.replace(/\D/g, '')))
            .forEach((h) => dirs.push(path.join(base, h, 'bin')));
    }
    return [...new Set(dirs)].map((d) => path.join(d, nombre));
}
/**
 * Entre las encontradas, la más cercana a la base: la menor versión que sea >= `minimo`. Una
 * más nueva de la cuenta también sirve para respaldar, pero su pg_restore escribe ajustes que
 * una base vieja no conoce (pg 17 → `transaction_timeout` en una 16; visto en el CI). Si
 * ninguna alcanza, la más nueva (quien llama dice que no sirve).
 */
export function elegir(encontradas, minimo) {
    const sirven = encontradas.filter((h) => h.version >= minimo).sort((a, b) => a.version - b.version);
    return sirven[0] ?? [...encontradas].sort((a, b) => b.version - a.version)[0] ?? null;
}
/** pg_dump / pg_restore para una base de versión `minimo` (ver `elegir`). */
export async function buscarHerramienta(nombre, minimo = 0) {
    const encontradas = [];
    for (const ruta of await candidatos(nombre)) {
        try {
            await fs.access(ruta, fs.constants.X_OK);
            const { stdout } = await ejecutar(ruta, ['--version'], { timeout: 10_000 });
            const version = Number(/(\d+)(?:\.\d+)?/.exec(stdout)?.[1] ?? 0);
            encontradas.push({ ruta, version });
        }
        catch {
            // No está o no se puede ejecutar: siguiente.
        }
    }
    return elegir(encontradas, minimo);
}
/**
 * La URL de Prisma lista para libpq: sin la clave (va en PGPASSWORD, así no se ve en la lista
 * de procesos del servidor compartido) y sin parámetros que libpq no conoce (?schema=…).
 */
export function conexionPg(url) {
    const u = new URL(url);
    const password = decodeURIComponent(u.password);
    u.password = '';
    const quedan = new URLSearchParams();
    for (const [k, v] of u.searchParams)
        if (['sslmode', 'sslrootcert', 'connect_timeout', 'host', 'port'].includes(k))
            quedan.set(k, v);
    u.search = quedan.toString();
    return { dbname: u.toString(), password };
}
export async function versionServidor() {
    const [{ v }] = await prismaAdmin.$queryRaw `SELECT current_setting('server_version_num') AS v`;
    return Math.floor(Number(v) / 10_000);
}
const NOMBRE = /^base-(\d{4}-\d{2}-\d{2})\.dump$/;
/** Hace el respaldo de hoy (o de `dia`). Lanza un error con el motivo si no se puede. */
/** `nombre` cambia el nombre del archivo (p. ej. la copia previa a restaurar); esa no se rota. */
export async function hacerRespaldo(opciones = {}) {
    const inicio = Date.now();
    const dir = opciones.dir ?? env.respaldosDir;
    const dia = opciones.dia ?? diaEn('America/Lima');
    const servidor = await versionServidor();
    const pgDump = await buscarHerramienta('pg_dump', servidor);
    if (!pgDump)
        throw new Error('No se encontró pg_dump en el servidor. Si existe en otra carpeta, ponla en PG_BIN_DIR.');
    if (pgDump.version < servidor) {
        throw new Error(`pg_dump ${pgDump.version} es más viejo que la base (PostgreSQL ${servidor}): no puede respaldarla. Pon en PG_BIN_DIR la carpeta de un pg_dump ${servidor} o más nuevo.`);
    }
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const destino = path.join(dir, opciones.nombre ? `${opciones.nombre}.dump` : `base-${dia}.dump`);
    const parcial = `${destino}.parcial`;
    const { dbname, password } = conexionPg(env.databaseAdminUrl);
    try {
        await new Promise((ok, mal) => {
            const p = spawn(pgDump.ruta, ['--format=custom', '--no-owner', `--file=${parcial}`, `--dbname=${dbname}`], {
                env: { ...process.env, PGPASSWORD: password, PGCONNECT_TIMEOUT: '15' },
                stdio: ['ignore', 'ignore', 'pipe'],
            });
            let error = '';
            p.stderr.on('data', (d) => (error += String(d)));
            p.on('error', mal);
            p.on('close', (codigo) => (codigo === 0 ? ok() : mal(new Error(`pg_dump terminó con código ${codigo}: ${error.trim().slice(0, 500)}`))));
        });
        await fs.rename(parcial, destino);
    }
    catch (e) {
        await fs.rm(parcial, { force: true });
        throw e;
    }
    // Lista de archivos: para comprobar después de restaurar que el disco tiene todo.
    const blobs = await prismaAdmin.blob.findMany({ select: { accountId: true, storageKey: true, byteSize: true, checksum: true }, orderBy: { createdAt: 'asc' } });
    const lista = path.join(dir, opciones.nombre ? `${opciones.nombre}-archivos.tsv` : `archivos-${dia}.tsv`);
    await new Promise((ok, mal) => {
        const w = createWriteStream(lista, { mode: 0o600 });
        w.on('error', mal);
        w.write('cuenta\tclave\tbytes\tsha256\n');
        for (const b of blobs)
            w.write(`${b.accountId}\t${b.storageKey}\t${b.byteSize}\t${b.checksum ?? ''}\n`);
        w.end(ok);
    });
    await rotar(dir, opciones.mantener ?? env.respaldosMantener);
    const { size } = await fs.stat(destino);
    return { archivo: destino, bytes: size, archivos: blobs.length, ms: Date.now() - inicio };
}
/** Deja los `mantener` respaldos más nuevos (y sus listas de archivos). */
export async function rotar(dir, mantener) {
    const dias = (await fs.readdir(dir))
        .map((f) => NOMBRE.exec(f)?.[1])
        .filter((d) => !!d)
        .sort()
        .reverse();
    for (const d of dias.slice(mantener)) {
        await fs.rm(path.join(dir, `base-${d}.dump`), { force: true });
        await fs.rm(path.join(dir, `archivos-${d}.tsv`), { force: true });
    }
}
/** Respaldos que hay, del más nuevo al más viejo. */
export async function listarRespaldos(dir = env.respaldosDir) {
    const nombres = await fs.readdir(dir).catch(() => []);
    const out = [];
    for (const f of nombres.filter((n) => NOMBRE.test(n)).sort().reverse()) {
        const s = await fs.stat(path.join(dir, f));
        out.push({ dia: NOMBRE.exec(f)[1], archivo: path.join(dir, f), bytes: s.size });
    }
    return out;
}
/**
 * Para el latido: si hoy no hay respaldo, lo hace en segundo plano (el latido no espera).
 * Devuelve qué pasó: 'hecho' (ya existía), 'en curso', o el último error.
 */
let enCurso = null;
let ultimoError = null;
export async function respaldoDelDia(log) {
    const dia = diaEn('America/Lima');
    if (enCurso)
        return 'en curso';
    const hay = await fs.access(path.join(env.respaldosDir, `base-${dia}.dump`)).then(() => true, () => false);
    if (hay)
        return 'hecho';
    // Un error de hoy no se reintenta en cada latido (cada hora): se reintenta mañana o a mano.
    if (ultimoError?.dia === dia)
        return `error: ${ultimoError.mensaje}`;
    enCurso = hacerRespaldo({ dia })
        .then(async (r) => {
        ultimoError = null;
        await prismaAdmin.auditLog.create({ data: { action: 'respaldo.ok', meta: { dia, bytes: r.bytes, archivos: r.archivos, ms: r.ms } } });
    })
        .catch(async (e) => {
        const mensaje = e instanceof Error ? e.message : String(e);
        ultimoError = { dia, mensaje };
        log?.(e);
        await prismaAdmin.auditLog.create({ data: { action: 'respaldo.error', meta: { dia, mensaje } } }).catch(() => { });
    })
        .finally(() => (enCurso = null));
    return 'en curso';
}
export const olvidarRespaldo = () => {
    ultimoError = null;
};
/** Para los tests: esperar el respaldo en segundo plano. */
export const esperarRespaldo = () => enCurso ?? Promise.resolve();
/**
 * Restaura un respaldo sobre la base actual (BORRA lo que hay). Antes hace una copia de lo
 * actual (antes-de-restaurar-<fecha>.dump), por si hubo que arrepentirse.
 */
export async function restaurarRespaldo(archivo) {
    await fs.access(archivo);
    const marca = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const previa = await hacerRespaldo({ nombre: `antes-de-restaurar-${marca}` });
    await restaurarEn(archivo, env.databaseAdminUrl);
    return { copiaPrevia: previa.archivo };
}
/** pg_restore de `archivo` en la base de `url` (los tests restauran en una base aparte). */
export async function restaurarEn(archivo, url) {
    const pgRestore = await buscarHerramienta('pg_restore', await versionServidor());
    if (!pgRestore)
        throw new Error('No se encontró pg_restore en el servidor. Si existe en otra carpeta, ponla en PG_BIN_DIR.');
    const { dbname, password } = conexionPg(url);
    await new Promise((ok, mal) => {
        const p = spawn(pgRestore.ruta, ['--clean', '--if-exists', '--no-owner', '--single-transaction', '--exit-on-error', `--dbname=${dbname}`, archivo], { env: { ...process.env, PGPASSWORD: password, PGCONNECT_TIMEOUT: '15' }, stdio: ['ignore', 'ignore', 'pipe'] });
        let error = '';
        p.stderr.on('data', (d) => (error += String(d)));
        p.on('error', mal);
        p.on('close', (codigo) => (codigo === 0 ? ok() : mal(new Error(`pg_restore terminó con código ${codigo}: ${error.trim().slice(0, 800)}`))));
    });
}
