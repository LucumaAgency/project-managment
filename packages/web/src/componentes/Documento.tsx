import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ErrorApi, type DetalleArchivo } from '../api';
import Comentarios from './Comentarios';
import Icono from './Icono';

const cuando = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const mensajeDe = (e: unknown) => (e instanceof ErrorApi ? e.message : 'No se pudo conectar.');

type Render = (texto: string) => string;
/** La librería de Markdown se baja solo al editar (la lectura usa el HTML que arma el servidor). */
let cargaRender: Promise<Render> | null = null;
const conRender = () => (cargaRender ??= import('@lucuma-pm/shared/markdown').then((m) => m.markdownAHtml));

/** Baja el texto como archivo .md (sin pasar por el servidor: ya lo tenemos). */
function descargar(titulo: string, texto: string) {
  const nombre = `${titulo.replace(/\.md$/i, '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'documento'}.md`;
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Documento en Markdown (D-82): se lee formateado y se edita con vista previa en vivo (lado a
 * lado en escritorio, en pestañas en el celular). Guardar manda la fecha de lo que se abrió para
 * no pisar el cambio de otra persona (409).
 */
export default function Documento({ d, volver, hacer, error, projectId, interno, onPapelera, onGuardado }: {
  d: DetalleArchivo;
  volver: string;
  hacer: (f: () => Promise<unknown>) => Promise<boolean>;
  error: string | null;
  projectId: string;
  interno: boolean;
  onPapelera: () => void;
  onGuardado: (d: DetalleArchivo) => void;
}) {
  const { archivo: a, permisos } = d;
  const doc = a.documento!;
  const [params, setParams] = useSearchParams();
  const editando = permisos.editarDocumento && params.get('editar') === '1';
  const setEditando = (si: boolean) => {
    const p = new URLSearchParams(params);
    if (si) p.set('editar', '1');
    else p.delete('editar');
    setParams(p, { replace: true });
  };

  return (
    <>
      <p className="meta" style={{ margin: '0 0 8px' }}>
        <Link to={volver}><Icono nombre="atras" tam={14} /> Archivos</Link>
      </p>
      <article className="card">
        <div className="fila" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h2 className="mensaje-titulo">{a.title}</h2>
            <p className="meta" style={{ margin: 0 }}>
              Documento · creado por {a.creator.name} · actualizado el {cuando(doc.updatedAt)}
              {interno && (a.visibleParaCliente ? ' · visible para el cliente' : ' · interno')}
            </p>
          </div>
          {!editando && permisos.editarDocumento && (
            <button type="button" className="btn" onClick={() => setEditando(true)}>
              <Icono nombre="editar" tam={16} />Editar
            </button>
          )}
        </div>

        {interno && a.visibleToClients && !a.visibleParaCliente && (
          <p className="aviso ambar">Está marcado visible, pero su carpeta es interna: el cliente no lo ve hasta que la carpeta sea visible.</p>
        )}

        {editando ? (
          <Editor
            key={doc.updatedAt}
            d={d}
            onCancelar={() => setEditando(false)}
            onGuardado={(nuevo) => {
              onGuardado(nuevo);
              setEditando(false);
            }}
          />
        ) : (
          <>
            {doc.markdown.trim() ? (
              // HTML armado en el servidor con HTML crudo desactivado y enlaces filtrados (shared/markdown.ts).
              <div className="documento-md" dangerouslySetInnerHTML={{ __html: doc.html }} />
            ) : (
              <p className="meta documento-vacio">
                Este documento está vacío.{permisos.editarDocumento && <> <button type="button" className="btn-texto" onClick={() => setEditando(true)}>Empieza a escribir</button></>}
              </p>
            )}

            <div className="acciones">
              <button type="button" className="btn btn-sec btn-chico" onClick={() => descargar(a.title, doc.markdown)}>
                <Icono nombre="descargar" tam={14} />Descargar .md
              </button>
              {permisos.renombrar && (
                <button type="button" className="btn btn-sec btn-chico" onClick={() => { const t = window.prompt('Nombre del documento', a.title); if (t?.trim()) hacer(() => api(`/elementos/${a.id}`, { method: 'PATCH', body: { title: t.trim() } })); }}>
                  <Icono nombre="editar" tam={14} />Renombrar
                </button>
              )}
              {permisos.cambiarVisibilidad && (
                <button type="button" className="btn btn-sec btn-chico" onClick={() => hacer(() => api(`/elementos/${a.id}`, { method: 'PATCH', body: { visibleToClients: !a.visibleToClients } }))}>
                  <Icono nombre="ojo" tam={14} />{a.visibleToClients ? 'Hacer interno' : 'Mostrar al cliente'}
                </button>
              )}
              {permisos.papelera && (
                <button type="button" className="btn-texto peligro" onClick={async () => { if (window.confirm('¿Mandar el documento a la papelera?') && (await hacer(() => api(`/elementos/${a.id}/papelera`, { body: {} })))) onPapelera(); }}>
                  Papelera
                </button>
              )}
            </div>
            {error && <p className="error" role="alert">{error}</p>}
          </>
        )}

        <Comentarios key={`${a.id}-${a.visibleToClients}`} elementoId={a.id} projectId={projectId} interno={!a.visibleToClients} />
      </article>
    </>
  );
}

function Editor({ d, onCancelar, onGuardado }: { d: DetalleArchivo; onCancelar: () => void; onGuardado: (d: DetalleArchivo) => void }) {
  const doc = d.archivo.documento!;
  const [texto, setTexto] = useState(doc.markdown);
  const [vista, setVista] = useState('');
  const [pestana, setPestana] = useState<'escribir' | 'vista'>('escribir');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const cambiado = texto !== doc.markdown;

  // Vista previa con la misma regla del servidor, un instante después de dejar de escribir.
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => conRender().then((r) => vivo && setVista(r(texto))), 120);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [texto]);

  // Avisar antes de cerrar la pestaña con cambios sin guardar.
  useEffect(() => {
    if (!cambiado) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [cambiado]);

  const guardar = useCallback(async () => {
    if (guardando) return;
    setGuardando(true);
    setError(null);
    try {
      onGuardado(await api<DetalleArchivo>(`/documentos/${d.archivo.id}`, { method: 'PUT', body: { contenido: texto, base: doc.updatedAt } }));
    } catch (e) {
      setError(mensajeDe(e));
      setGuardando(false);
    }
  }, [guardando, d.archivo.id, texto, doc.updatedAt, onGuardado]);

  function teclas(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void guardar();
      return;
    }
    // Tab mete dos espacios (para listas anidadas) en vez de saltar al botón siguiente.
    if (e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const c = e.currentTarget;
      const { selectionStart: i, selectionEnd: f } = c;
      const nuevo = `${texto.slice(0, i)}  ${texto.slice(f)}`;
      setTexto(nuevo);
      requestAnimationFrame(() => c.setSelectionRange(i + 2, i + 2));
    }
  }

  function cancelar() {
    if (cambiado && !window.confirm('Tienes cambios sin guardar. ¿Descartarlos?')) return;
    onCancelar();
  }

  return (
    <div className="editor-md" data-pestana={pestana}>
      <div className="pestanas editor-md-pestanas" role="tablist">
        <button type="button" role="tab" aria-selected={pestana === 'escribir'} className={pestana === 'escribir' ? 'activa' : ''} onClick={() => setPestana('escribir')}>Escribir</button>
        <button type="button" role="tab" aria-selected={pestana === 'vista'} className={pestana === 'vista' ? 'activa' : ''} onClick={() => setPestana('vista')}>Vista previa</button>
      </div>
      <div className="editor-md-paneles">
        <div className="editor-md-escribir">
          <textarea
            ref={campo}
            autoFocus
            spellCheck
            aria-label="Texto del documento en Markdown"
            placeholder={'# Título\n\nEscribe aquí. **negrita**, *cursiva*, listas con -, enlaces [texto](https://…)'}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={teclas}
          />
        </div>
        <div className="editor-md-vista">
          {texto.trim() ? <div className="documento-md" dangerouslySetInnerHTML={{ __html: vista }} /> : <p className="meta">La vista previa aparece aquí.</p>}
        </div>
      </div>
      <p className="ayuda editor-md-ayuda">
        <code># Título</code> <code>## Subtítulo</code> <code>**negrita**</code> <code>*cursiva*</code> <code>- lista</code> <code>1. lista</code>{' '}
        <code>[texto](https://…)</code> <code>`código`</code> <code>| tabla |</code> <code>&gt; cita</code> · Ctrl+S guarda
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones" style={{ justifyContent: 'flex-end' }}>
        <span className="meta" style={{ marginRight: 'auto' }}>{cambiado ? 'Cambios sin guardar' : 'Sin cambios'}</span>
        <button type="button" className="btn btn-sec" disabled={guardando} onClick={cancelar}>Cancelar</button>
        <button type="button" className="btn" disabled={guardando || !cambiado} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </div>
  );
}
