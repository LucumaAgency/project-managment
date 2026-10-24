import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { api, ErrorApi } from '../api';
import { useYo } from '../contexto';
import Editor, { Contenido, type ControlEditor } from './Editor';
import { useMencionables } from './mencionables';
import { iniciales } from './Marca';

interface Comentario {
  id: string;
  bodyHtml: string;
  body?: JSONContent;
  creator: { id: string; name: string };
  createdAt: string;
  editado: boolean;
  permisos: { editar: boolean; papelera: boolean };
}
interface Respuesta {
  comentarios: Comentario[];
  puedeComentar: boolean;
  siguiendo: boolean;
  seguidores: { userId: string; name: string }[];
}

const cuando = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const mensajeDe = (e: unknown) => (e instanceof ErrorApi ? e.message : 'No se pudo conectar.');

/**
 * Comentarios de cualquier elemento (tarea, lista, mensaje, archivo), con @menciones y el botón
 * para seguir. `interno`: el elemento no es visible para clientes (no se los puede mencionar).
 */
export default function Comentarios({ elementoId, projectId, interno, onCambio }: { elementoId: string; projectId: string; interno: boolean; onCambio?: () => void }) {
  const yo = useYo();
  const [d, setD] = useState<Respuesta | null>(null);
  const [nuevo, setNuevo] = useState<{ doc: JSONContent; vacio: boolean } | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<JSONContent | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editor = useRef<ControlEditor>(null);

  const cargar = useCallback(() => {
    api<Respuesta>(`/elementos/${elementoId}/comentarios`).then(setD).catch((e) => setError(mensajeDe(e)));
  }, [elementoId]);
  useEffect(cargar, [cargar]);
  const personas = useMencionables(projectId, interno, yo.usuario.id);

  const hacer = async (f: () => Promise<unknown>) => {
    setError(null);
    try {
      await f();
      cargar();
      onCambio?.();
      return true;
    } catch (e) {
      setError(mensajeDe(e));
      return false;
    }
  };

  async function comentar() {
    if (!nuevo || nuevo.vacio || enviando) return;
    setEnviando(true);
    const ok = await hacer(() => api(`/elementos/${elementoId}/comentarios`, { body: { body: nuevo.doc } }));
    if (ok) {
      editor.current?.limpiar();
      setNuevo(null);
    }
    setEnviando(false);
  }

  if (!d) return error ? <p className="error">{error}</p> : null;

  return (
    <section className="comentarios" aria-label="Comentarios">
      <div className="fila comentarios-cab">
        <h3 className="titulo-panel">Comentarios{d.comentarios.length ? ` (${d.comentarios.length})` : ''}</h3>
        <span className="meta">
          {d.seguidores.length > 0 && `${d.seguidores.length} ${d.seguidores.length === 1 ? 'persona sigue' : 'personas siguen'} esto · `}
          <button type="button" className="btn-texto" onClick={() => hacer(() => api(`/elementos/${elementoId}/${d.siguiendo ? 'dejar-de-seguir' : 'seguir'}`, { body: {} }))}>
            {d.siguiendo ? 'Dejar de seguir' : 'Seguir'}
          </button>
        </span>
      </div>
      <p className="ayuda" style={{ marginTop: 0 }}>
        {d.siguiendo ? 'Te avisaremos de los comentarios nuevos.' : 'No recibirás avisos de esto salvo que te mencionen.'}
      </p>

      <ol className="lista-comentarios">
        {d.comentarios.map((c) => (
          <li key={c.id} className="comentario">
            <span className={`avatar${c.creator.id === yo.usuario.id ? '' : ' gris'}`}>{iniciales(c.creator.name)}</span>
            <div className="comentario-cuerpo">
              <div className="comentario-cab">
                <b>{c.creator.name}</b>
                <span className="meta">{cuando(c.createdAt)}{c.editado ? ' · editado' : ''}</span>
              </div>
              {editando === c.id ? (
                <>
                  <Editor valor={c.body ?? null} personas={personas} autoFocus etiqueta="Editar comentario" onChange={(doc) => setEdicion(doc)} />
                  <div className="acciones" style={{ margin: '8px 0 0' }}>
                    <button
                      type="button"
                      className="btn btn-chico"
                      onClick={async () => {
                        if (edicion && (await hacer(() => api(`/elementos/${c.id}`, { method: 'PATCH', body: { body: edicion } })))) setEditando(null);
                      }}
                    >
                      Guardar
                    </button>
                    <button type="button" className="btn btn-sec btn-chico" onClick={() => setEditando(null)}>Cancelar</button>
                  </div>
                </>
              ) : (
                <>
                  <Contenido html={c.bodyHtml} />
                  {(c.permisos.editar || c.permisos.papelera) && (
                    <div className="comentario-acciones">
                      {c.permisos.editar && (
                        <button type="button" className="btn-texto" onClick={() => { setEdicion(c.body ?? null); setEditando(c.id); }}>Editar</button>
                      )}
                      {c.permisos.papelera && (
                        <button type="button" className="btn-texto peligro" onClick={() => window.confirm('¿Borrar este comentario?') && hacer(() => api(`/elementos/${c.id}/papelera`, { body: {} }))}>
                          Borrar
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ol>

      {d.puedeComentar && (
        <div className="nuevo-comentario">
          <Editor
            ref={editor}
            personas={personas}
            placeholder="Escribe un comentario… usa @ para avisar a alguien"
            etiqueta="Nuevo comentario"
            onChange={(doc, vacio) => setNuevo({ doc, vacio })}
            onEnviar={comentar}
          />
          <div className="acciones" style={{ margin: '8px 0 0', justifyContent: 'flex-end' }}>
            <span className="ayuda" style={{ marginRight: 'auto', marginTop: 0 }}>Ctrl + Enter para enviar</span>
            <button type="button" className="btn" disabled={!nuevo || nuevo.vacio || enviando} onClick={comentar}>
              {enviando ? 'Enviando…' : 'Comentar'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
