/**
 * Errores a Sentry sin el SDK (D-59).
 *
 * El SDK de Node trae ~40 paquetes de OpenTelemetry y, para funcionar completo, un cargador al
 * arrancar (--import) que choca con arranque.cjs de Passenger. Lo que se necesita es poco:
 * mandar el error con su pila. Esto usa el formato "envelope" que Sentry recibe por HTTP.
 *
 * Qué se manda: tipo, mensaje, pila, ruta (el patrón, no la URL: podría traer el token del
 * latido), método, estado, y los IDs de cuenta y persona. Qué NO: cuerpo, query, cookies,
 * encabezados, correos ni nombres.
 *
 * Sin SENTRY_DSN no hace nada. Frena tormentas: el mismo error una vez por minuto y como mucho
 * 30 envíos por minuto.
 */
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { env } from '../env.js';
const VERSION = (() => {
    try {
        return createRequire(import.meta.url)('../../package.json').version;
    }
    catch {
        return '0.0.0';
    }
})();
/** https://<clave>@o1.ingest.sentry.io/<proyecto> → URL del envelope y la clave pública. */
export function leerDsn(dsn) {
    try {
        const u = new URL(dsn);
        const partes = u.pathname.split('/').filter(Boolean);
        const proyecto = partes.pop();
        if (!u.username || !proyecto || !/^\d+$/.test(proyecto))
            return null;
        const prefijo = partes.length ? `/${partes.join('/')}` : '';
        return { url: `${u.protocol}//${u.host}${prefijo}/api/${proyecto}/envelope/`, clave: u.username };
    }
    catch {
        return null;
    }
}
/** La pila de V8 en marcos de Sentry, del más viejo al más nuevo (como los espera Sentry). */
export function marcos(pila) {
    if (!pila)
        return [];
    const out = [];
    for (const linea of pila.split('\n').slice(1)) {
        const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(linea);
        if (!m)
            continue;
        const archivo = m[2].replace(/^file:\/\//, '');
        out.push({
            function: m[1] || '<anónima>',
            filename: archivo,
            lineno: Number(m[3]),
            colno: Number(m[4]),
            in_app: !archivo.includes('node_modules') && !archivo.startsWith('node:'),
        });
    }
    return out.reverse().slice(-60);
}
export function evento(err, ctx = {}) {
    const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
    const tags = {};
    if (ctx.ruta)
        tags.ruta = ctx.ruta;
    if (ctx.metodo)
        tags.metodo = ctx.metodo;
    if (ctx.status)
        tags.status = String(ctx.status);
    if (ctx.cuenta)
        tags.cuenta = ctx.cuenta;
    if (ctx.donde)
        tags.donde = ctx.donde;
    const codigo = e.code;
    if (typeof codigo === 'string')
        tags.codigo = codigo;
    return {
        event_id: randomBytes(16).toString('hex'),
        timestamp: Date.now() / 1000,
        platform: 'node',
        level: 'error',
        environment: env.nodeEnv,
        release: `lucuma-pm@${VERSION}`,
        exception: { values: [{ type: e.name, value: e.message.slice(0, 2000), stacktrace: { frames: marcos(e.stack) } }] },
        tags,
        ...(ctx.usuario ? { user: { id: ctx.usuario } } : {}),
    };
}
const vistos = new Map();
let ventana = { desde: 0, enviados: 0 };
/** Manda el error si hay DSN. Nunca lanza ni hace esperar: es lo último que debe fallar. */
export function reportar(err, ctx = {}, dsn = env.sentryDsn) {
    const destino = dsn ? leerDsn(dsn) : null;
    if (!destino)
        return Promise.resolve(false);
    const ahora = Date.now();
    const firma = `${err?.name}:${err?.message}:${ctx.ruta ?? ctx.donde ?? ''}`;
    if (ahora - (vistos.get(firma) ?? 0) < 60_000)
        return Promise.resolve(false);
    if (ahora - ventana.desde > 60_000)
        ventana = { desde: ahora, enviados: 0 };
    if (ventana.enviados >= 30)
        return Promise.resolve(false);
    vistos.set(firma, ahora);
    ventana.enviados++;
    if (vistos.size > 500)
        vistos.clear();
    const ev = evento(err, ctx);
    const cuerpo = [JSON.stringify({ event_id: ev.event_id, sent_at: new Date().toISOString() }), JSON.stringify({ type: 'event' }), JSON.stringify(ev)].join('\n');
    return fetch(destino.url, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-sentry-envelope',
            'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${destino.clave}, sentry_client=lucuma-pm/${VERSION}`,
        },
        body: cuerpo,
        signal: AbortSignal.timeout(5_000),
    })
        .then((r) => r.ok)
        .catch(() => false);
}
/** Para los tests. */
export const olvidarReportes = () => {
    vistos.clear();
    ventana = { desde: 0, enviados: 0 };
};
