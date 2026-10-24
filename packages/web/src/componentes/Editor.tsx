import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { EditorContent, ReactRenderer, useEditor, type Editor as TiptapEditor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import Icono, { type NombreIcono } from './Icono';

/**
 * Editor de texto compartido: tareas, mensajes y comentarios lo usan igual.
 *
 * Solo produce el JSON del documento. El HTML que ven los demás lo arma el servidor
 * (lib/documento.ts) con una lista cerrada de formatos, así que aquí se permiten exactamente
 * esos: negrita, cursiva, tachado, código, título (2 niveles), listas, cita, enlace y @mención.
 */
export interface PersonaMencionable {
  userId: string;
  name: string;
}

export interface PropsEditor {
  valor?: JSONContent | null;
  onChange?: (doc: JSONContent, vacio: boolean) => void;
  /** Quienes aparecen al escribir @. Vacío = sin menciones. */
  personas?: PersonaMencionable[];
  placeholder?: string;
  autoFocus?: boolean;
  /** Ctrl/Cmd + Enter (enviar un comentario sin soltar el teclado). */
  onEnviar?: () => void;
  etiqueta?: string;
}

export interface ControlEditor {
  limpiar: () => void;
  enfocar: () => void;
}

const Editor = forwardRef<ControlEditor, PropsEditor>(function Editor(
  { valor, onChange, personas = [], placeholder = 'Escribe aquí…', autoFocus, onEnviar, etiqueta },
  ref
) {
  // La lista de personas cambia después de montar (llega de la API): se lee siempre la última.
  const personasRef = useRef(personas);
  personasRef.current = personas;
  const enviarRef = useRef(onEnviar);
  enviarRef.current = onEnviar;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false, autolink: true, protocols: ['mailto'], HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } }),
      Placeholder.configure({ placeholder }),
      Mention.configure({
        HTMLAttributes: { class: 'mencion' },
        renderText: ({ node }) => `@${node.attrs.label ?? ''}`,
        renderHTML: ({ node }) => ['span', { class: 'mencion', 'data-id': node.attrs.id }, `@${node.attrs.label ?? ''}`],
        suggestion: {
          items: ({ query }) => ordenarPorParecido(personasRef.current, query).slice(0, 8),
          render: renderSugerencias,
        },
      }),
    ],
    content: valor ?? '',
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: { class: 'prosa editor-area', role: 'textbox', 'aria-multiline': 'true', ...(etiqueta ? { 'aria-label': etiqueta } : {}) },
      handleKeyDown: (_vista, e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && enviarRef.current) {
          enviarRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => onChange?.(e.getJSON(), e.isEmpty),
  });

  useImperativeHandle(ref, () => ({
    limpiar: () => editor?.commands.clearContent(true),
    enfocar: () => editor?.commands.focus('end'),
  }), [editor]);

  if (!editor) return null;
  return (
    <div className="editor">
      <BarraEditor editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
});
export default Editor;

function BarraEditor({ editor }: { editor: TiptapEditor }) {
  // Re-render en cada cambio de selección para que los botones muestren el estado activo.
  const [, setTic] = useState(0);
  useEffect(() => {
    const f = () => setTic((n) => n + 1);
    editor.on('selectionUpdate', f);
    editor.on('transaction', f);
    return () => {
      editor.off('selectionUpdate', f);
      editor.off('transaction', f);
    };
  }, [editor]);

  const boton = (nombre: string, icono: NombreIcono | null, texto: string | null, activo: boolean, accion: () => void) => (
    <button
      key={nombre}
      type="button"
      className={activo ? 'activo' : ''}
      title={nombre}
      aria-label={nombre}
      aria-pressed={activo}
      onMouseDown={(e) => e.preventDefault()} // no perder la selección
      onClick={accion}
    >
      {icono ? <Icono nombre={icono} tam={16} /> : <b>{texto}</b>}
    </button>
  );
  const c = () => editor.chain().focus();

  function enlace() {
    const actual = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Dirección del enlace (déjala vacía para quitarlo)', actual ?? 'https://');
    if (url === null) return;
    if (!url.trim() || url.trim() === 'https://') return c().extendMarkRange('link').unsetLink().run();
    c().extendMarkRange('link').setLink({ href: url.trim() }).run();
  }

  return (
    <div className="barra-editor" role="toolbar" aria-label="Formato">
      {boton('Negrita', null, 'B', editor.isActive('bold'), () => c().toggleBold().run())}
      {boton('Cursiva', 'cursiva', null, editor.isActive('italic'), () => c().toggleItalic().run())}
      {boton('Tachado', 'tachado', null, editor.isActive('strike'), () => c().toggleStrike().run())}
      <span className="separador" />
      {boton('Título', null, 'T', editor.isActive('heading', { level: 2 }), () => c().toggleHeading({ level: 2 }).run())}
      {boton('Lista', 'lista', null, editor.isActive('bulletList'), () => c().toggleBulletList().run())}
      {boton('Lista numerada', 'listaNumerada', null, editor.isActive('orderedList'), () => c().toggleOrderedList().run())}
      {boton('Cita', 'cita', null, editor.isActive('blockquote'), () => c().toggleBlockquote().run())}
      {boton('Enlace', 'enlace', null, editor.isActive('link'), enlace)}
      <span className="separador" />
      {boton('Mencionar a alguien', null, '@', false, () => c().insertContent('@').run())}
    </div>
  );
}

/** HTML ya saneado por el servidor (bodyHtml). Nunca pasar aquí HTML que no venga de la API. */
export function Contenido({ html, className }: { html: string | null | undefined; className?: string }) {
  if (!html) return null;
  return <div className={`prosa ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Primero quien empieza con lo escrito ("Luc" → Lucía), después quien tiene una palabra que
 * empieza así, y al final quien solo lo contiene ("Equipo Lucuma"). Sin tildes ni mayúsculas.
 */
const normal = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function ordenarPorParecido<T extends { name: string }>(personas: T[], query: string): T[] {
  const q = normal(query.trim());
  if (!q) return personas;
  const nivel = (nombre: string) => {
    const n = normal(nombre);
    if (n.startsWith(q)) return 0;
    if (n.split(/\s+/).some((palabra) => palabra.startsWith(q))) return 1;
    return n.includes(q) ? 2 : -1;
  };
  return personas
    .map((p) => ({ p, n: nivel(p.name) }))
    .filter((x) => x.n >= 0)
    .sort((a, b) => a.n - b.n || a.p.name.localeCompare(b.p.name, 'es'))
    .map((x) => x.p);
}

// --- Lista de sugerencias del @ -------------------------------------------------------

interface ControlLista {
  onKeyDown: (p: SuggestionKeyDownProps) => boolean;
}

const ListaSugerencias = forwardRef<ControlLista, SuggestionProps<PersonaMencionable>>(function ListaSugerencias(props, ref) {
  const [indice, setIndice] = useState(0);
  useEffect(() => setIndice(0), [props.items]);
  const elegir = (i: number) => {
    const p = props.items[i];
    if (p) props.command({ id: p.userId, label: p.name });
  };
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!props.items.length) return false;
      if (event.key === 'ArrowDown') return setIndice((i) => (i + 1) % props.items.length), true;
      if (event.key === 'ArrowUp') return setIndice((i) => (i - 1 + props.items.length) % props.items.length), true;
      if (event.key === 'Enter' || event.key === 'Tab') return elegir(indice), true;
      return false;
    },
  }));
  return (
    <div className="sugerencias" role="listbox" aria-label="Personas">
      {props.items.length === 0 ? (
        <div className="vacia">Nadie con ese nombre en el proyecto</div>
      ) : (
        props.items.map((p, i) => (
          <button
            key={p.userId}
            type="button"
            role="option"
            aria-selected={i === indice}
            className={i === indice ? 'activa' : ''}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => elegir(i)}
          >
            {p.name}
          </button>
        ))
      )}
    </div>
  );
});

/** La lista flota debajo del @, dentro del documento (sin librería de posicionamiento). */
function renderSugerencias() {
  let lista: ReactRenderer<ControlLista, SuggestionProps<PersonaMencionable>> | null = null;
  const ubicar = (props: SuggestionProps<PersonaMencionable>) => {
    const r = props.clientRect?.();
    const el = lista?.element as HTMLElement | undefined;
    if (!r || !el) return;
    el.style.position = 'fixed';
    el.style.zIndex = '60';
    el.style.top = `${Math.min(r.bottom + 6, window.innerHeight - 240)}px`;
    el.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 248))}px`;
  };
  return {
    onStart: (props: SuggestionProps<PersonaMencionable>) => {
      lista = new ReactRenderer(ListaSugerencias, { props, editor: props.editor });
      document.body.appendChild(lista.element);
      ubicar(props);
    },
    onUpdate: (props: SuggestionProps<PersonaMencionable>) => {
      lista?.updateProps(props);
      ubicar(props);
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (props.event.key === 'Escape') {
        lista?.element.remove();
        return true;
      }
      return lista?.ref?.onKeyDown(props) ?? false;
    },
    onExit: () => {
      lista?.element.remove();
      lista?.destroy();
      lista = null;
    },
  };
}
