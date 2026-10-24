/**
 * Errores de la web a Sentry, sin SDK (D-59; misma idea que packages/api/src/lib/sentry.ts).
 * Se activa solo si /config trae un DSN. Manda tipo, mensaje, pila y la ruta SIN la query
 * (los enlaces de invitación llevan su token ahí). Nada de lo que la persona escribió.
 */
import { Component, type ReactNode } from 'react';

let destino: { url: string } | null = null;
const vistos = new Set<string>();
let enviados = 0;

export function activarSentry(dsn: string | null) {
  if (!dsn || destino) return;
  try {
    const u = new URL(dsn);
    const partes = u.pathname.split('/').filter(Boolean);
    const proyecto = partes.pop();
    if (!u.username || !proyecto) return;
    const prefijo = partes.length ? `/${partes.join('/')}` : '';
    // La clave va en la URL y el cuerpo como texto: así el navegador no hace preflight.
    destino = { url: `${u.protocol}//${u.host}${prefijo}/api/${proyecto}/envelope/?sentry_key=${u.username}&sentry_version=7` };
  } catch {
    return;
  }
  window.addEventListener('error', (e) => reportarWeb(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportarWeb(e.reason));
}

/** Pila de Chrome ("at f (url:1:2)") o de Firefox/Safari ("f@url:1:2") en marcos de Sentry. */
export function marcosWeb(pila: string | undefined) {
  if (!pila) return [];
  const out: { function: string; filename: string; lineno: number; colno: number; in_app: boolean }[] = [];
  for (const linea of pila.split('\n')) {
    const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(linea) ?? /^(.*?)@(.+?):(\d+):(\d+)$/.exec(linea);
    if (!m) continue;
    const archivo = m[2].replace(/\?.*$/, '');
    out.push({ function: m[1] || '<anónima>', filename: archivo, lineno: Number(m[3]), colno: Number(m[4]), in_app: archivo.startsWith(location.origin) });
  }
  return out.reverse().slice(-60);
}

export function reportarWeb(err: unknown) {
  if (!destino || enviados >= 20) return;
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Error desconocido');
  const firma = `${e.name}:${e.message}`;
  if (vistos.has(firma)) return;
  vistos.add(firma);
  enviados++;
  const id = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
  const ev = {
    event_id: id,
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level: 'error',
    environment: import.meta.env.MODE,
    exception: { values: [{ type: e.name, value: e.message.slice(0, 2000), stacktrace: { frames: marcosWeb(e.stack) } }] },
    request: { url: location.origin + location.pathname },
    tags: { ruta: location.pathname.replace(/[a-z0-9]{20,}/gi, ':id') },
  };
  const cuerpo = [JSON.stringify({ event_id: id, sent_at: new Date().toISOString() }), JSON.stringify({ type: 'event' }), JSON.stringify(ev)].join('\n');
  fetch(destino.url, { method: 'POST', body: cuerpo, keepalive: true, credentials: 'omit', headers: { 'content-type': 'text/plain;charset=UTF-8' } }).catch(() => {});
}

/** Si una pantalla se rompe al dibujarse: aviso para recargar (y a Sentry), no una página en blanco. */
export class AtajoDeErrores extends Component<{ children: ReactNode }, { roto: boolean }> {
  state = { roto: false };
  static getDerivedStateFromError() {
    return { roto: true };
  }
  componentDidCatch(error: unknown) {
    reportarWeb(error);
  }
  render() {
    if (!this.state.roto) return this.props.children;
    return (
      <div className="card vacio" style={{ margin: 24 }}>
        <p className="nombre" style={{ color: 'var(--texto)', marginTop: 0 }}>Algo falló al mostrar esta pantalla.</p>
        <p className="meta">Ya quedó registrado. Recarga la página para seguir.</p>
        <button type="button" className="btn" onClick={() => location.reload()}>Recargar</button>
      </div>
    );
  }
}
