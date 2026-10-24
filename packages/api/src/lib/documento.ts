/**
 * Documento del editor (JSON de Tiptap) → HTML seguro, texto plano y menciones.
 *
 * El navegador manda SOLO el JSON. El HTML lo arma el servidor, aquí, recorriendo los nodos
 * con una lista cerrada de tipos y formatos: lo que no está en la lista no pasa (400). Nunca se
 * guarda HTML que venga del navegador, así que no hay forma de colar un <script>, un
 * onerror= o un enlace javascript: en lo que ven los demás (ni en los correos, más adelante).
 *
 * Es una función pura: no toca la base. Quién puede ser mencionado lo decide services/menciones.
 */
import { HttpError } from './errores.js';

export interface DocumentoProcesado {
  /** El JSON normalizado (sin atributos desconocidos): es lo que se guarda en `body`. */
  json: Nodo;
  html: string;
  /** Para búsqueda, vistas previas y avisos. Bloques separados por salto de línea. */
  texto: string;
  /** userIds mencionados, sin repetir, en orden de aparición. */
  menciones: string[];
}

export interface Nodo {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Nodo[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

const MAX_PROFUNDIDAD = 20;
const MAX_NODOS = 5000;
const MAX_TEXTO = 100_000;

/** Bloques permitidos y su etiqueta. */
const BLOQUES: Record<string, string> = {
  paragraph: 'p',
  blockquote: 'blockquote',
  bulletList: 'ul',
  orderedList: 'ol',
  listItem: 'li',
  codeBlock: 'pre',
};
/** Formatos de texto permitidos y su etiqueta. `link` se trata aparte. */
const MARCAS: Record<string, string> = { bold: 'strong', italic: 'em', strike: 's', code: 'code' };

export function escaparHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Solo http(s) y mailto. Cualquier otra cosa (javascript:, data:, vbscript:) no es enlace. */
export function enlaceSeguro(href: unknown): string | null {
  if (typeof href !== 'string' || href.length > 2000) return null;
  const limpio = href.trim();
  try {
    const u = new URL(limpio);
    return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

function invalido(por: string): never {
  throw new HttpError(400, `El texto tiene un formato que no se admite (${por}).`);
}

export function procesarDocumento(entrada: unknown): DocumentoProcesado {
  let nodos = 0;
  let largo = 0;
  const menciones: string[] = [];

  function normalizar(n: unknown, profundidad: number): Nodo {
    if (profundidad > MAX_PROFUNDIDAD) invalido('demasiado anidado');
    if (++nodos > MAX_NODOS) invalido('demasiado largo');
    if (!n || typeof n !== 'object' || Array.isArray(n)) invalido('nodo');
    const o = n as Record<string, unknown>;
    if (typeof o.type !== 'string') invalido('nodo sin tipo');
    const type: string = o.type;

    if (type === 'text') {
      if (typeof o.text !== 'string' || o.text.length === 0) invalido('texto');
      largo += (o.text as string).length;
      if (largo > MAX_TEXTO) invalido('demasiado largo');
      const marks = Array.isArray(o.marks) ? o.marks.map(normalizarMarca) : undefined;
      return { type, text: o.text as string, ...(marks?.length ? { marks } : {}) };
    }
    if (type === 'hardBreak' || type === 'horizontalRule') return { type };
    if (type === 'mention') {
      const attrs = (o.attrs ?? {}) as Record<string, unknown>;
      if (typeof attrs.id !== 'string' || !attrs.id || attrs.id.length > 40) invalido('mención');
      const label = typeof attrs.label === 'string' ? attrs.label.slice(0, 120) : '';
      if (!menciones.includes(attrs.id as string)) menciones.push(attrs.id as string);
      return { type, attrs: { id: attrs.id, label } };
    }

    const hijos = o.content === undefined ? [] : Array.isArray(o.content) ? o.content : invalido('contenido');
    const content = (hijos as unknown[]).map((h) => normalizar(h, profundidad + 1));
    if (type === 'doc') return { type, content };
    if (type === 'heading') {
      const nivel = (o.attrs as Record<string, unknown> | undefined)?.level;
      return { type, attrs: { level: nivel === 3 ? 3 : 2 }, content };
    }
    if (type === 'orderedList') {
      const inicio = Number((o.attrs as Record<string, unknown> | undefined)?.start ?? 1);
      return { type, attrs: { start: Number.isInteger(inicio) && inicio > 0 && inicio < 100000 ? inicio : 1 }, content };
    }
    if (type in BLOQUES) return { type, content };
    return invalido(type);
  }

  function normalizarMarca(m: unknown): NonNullable<Nodo['marks']>[number] {
    if (!m || typeof m !== 'object') return invalido('formato');
    const { type, attrs } = m as { type?: unknown; attrs?: Record<string, unknown> };
    if (type === 'link') {
      const href = enlaceSeguro(attrs?.href);
      // Un enlace peligroso no rompe el documento: el texto queda, sin enlace.
      return href ? { type: 'link', attrs: { href } } : { type: 'sinEnlace' };
    }
    if (typeof type === 'string' && type in MARCAS) return { type };
    return invalido(String(type));
  }

  const json = normalizar(entrada, 0);
  if (json.type !== 'doc') invalido('documento');
  // Quitar las marcas de enlace descartadas.
  const limpiar = (n: Nodo): Nodo => ({
    ...n,
    ...(n.marks ? { marks: n.marks.filter((m) => m.type !== 'sinEnlace') } : {}),
    ...(n.content ? { content: n.content.map(limpiar) } : {}),
  });
  const final = limpiar(json);
  return { json: final, html: aHtml(final), texto: aTexto(final).trim(), menciones };
}

function aHtml(n: Nodo): string {
  const hijos = () => (n.content ?? []).map(aHtml).join('');
  switch (n.type) {
    case 'doc':
      return hijos();
    case 'text': {
      let s = escaparHtml(n.text ?? '');
      for (const m of n.marks ?? []) {
        if (m.type === 'link') {
          s = `<a href="${escaparHtml(String(m.attrs!.href))}" target="_blank" rel="noopener noreferrer nofollow">${s}</a>`;
        } else if (m.type in MARCAS) {
          s = `<${MARCAS[m.type]}>${s}</${MARCAS[m.type]}>`;
        }
      }
      return s;
    }
    case 'hardBreak':
      return '<br>';
    case 'horizontalRule':
      return '<hr>';
    case 'mention':
      return `<span class="mencion" data-id="${escaparHtml(String(n.attrs!.id))}">@${escaparHtml(String(n.attrs!.label || 'alguien'))}</span>`;
    case 'heading':
      return `<h${n.attrs!.level}>${hijos()}</h${n.attrs!.level}>`;
    case 'orderedList':
      return n.attrs!.start === 1 ? `<ol>${hijos()}</ol>` : `<ol start="${n.attrs!.start}">${hijos()}</ol>`;
    case 'codeBlock':
      return `<pre><code>${hijos()}</code></pre>`;
    default:
      return `<${BLOQUES[n.type]}>${hijos()}</${BLOQUES[n.type]}>`;
  }
}

/** Texto plano: un bloque por línea; los ítems de lista con guion. */
function aTexto(n: Nodo): string {
  const enLinea = (hijos: Nodo[] = []) => hijos.map(aTexto).join('');
  const bloques = (hijos: Nodo[] = []) => hijos.map(aTexto).filter((x) => x !== '').join('\n');
  switch (n.type) {
    case 'text':
      return n.text ?? '';
    case 'hardBreak':
      return '\n';
    case 'horizontalRule':
      return '';
    case 'mention':
      return `@${n.attrs!.label || 'alguien'}`;
    case 'doc':
    case 'blockquote':
      return bloques(n.content);
    case 'bulletList':
    case 'orderedList':
      return (n.content ?? []).map((li) => `- ${aTexto(li)}`).join('\n');
    case 'listItem':
      return (n.content ?? []).map(aTexto).join(' ').trim();
    default: // paragraph, heading, codeBlock
      return enLinea(n.content);
  }
}

/** Texto plano (lo que mandaba la API antes del editor) → documento de párrafos. */
export function documentoDesdeTexto(texto: string): Nodo {
  const parrafos = texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return {
    type: 'doc',
    content: parrafos.map((p) => {
      const lineas = p.split('\n');
      const content: Nodo[] = [];
      lineas.forEach((l, i) => {
        if (i > 0) content.push({ type: 'hardBreak' });
        if (l) content.push({ type: 'text', text: l });
      });
      return { type: 'paragraph', content };
    }),
  };
}

/** ¿El documento está vacío (solo párrafos sin texto ni menciones)? */
export const documentoVacio = (d: DocumentoProcesado) => d.texto.trim() === '' && d.menciones.length === 0;
