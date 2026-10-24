import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { esCliente } from '@lucuma-pm/shared';
import type { JSONContent } from '@tiptap/react';
import { api, ErrorApi, type ElementoConPermisos } from '../api';
import Comentarios from '../componentes/Comentarios';
import Editor, { Contenido } from '../componentes/Editor';
import { useMencionables } from '../componentes/mencionables';
import { useLeerAvisosDe } from '../componentes/avisos';
import Icono from '../componentes/Icono';
import { iniciales } from '../componentes/Marca';
import { useYo } from '../contexto';

const cuando = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const mensajeDe = (e: unknown) => (e instanceof ErrorApi ? e.message : 'No se pudo conectar.');

/** Un mensaje con sus comentarios. Quien lo escribió (o un admin) lo edita y lo borra. */
export default function Mensaje() {
  const { id: projectId, mensajeId } = useParams<{ id: string; mensajeId: string }>();
  const yo = useYo();
  const navegar = useNavigate();
  const [d, setD] = useState<ElementoConPermisos | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [cuerpo, setCuerpo] = useState<JSONContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useLeerAvisosDe(mensajeId);
  const cargar = useCallback(() => {
    api<ElementoConPermisos>(`/elementos/${mensajeId}`)
      .then((r) => (r.elemento.type === 'message' ? setD(r) : setNoExiste(true)))
      .catch((e) => (e instanceof ErrorApi && e.status === 404 ? setNoExiste(true) : setError(mensajeDe(e))));
  }, [mensajeId]);
  useEffect(cargar, [cargar]);
  const interno = !d?.elemento.visibleToClients;
  const personas = useMencionables(projectId, interno, yo.usuario.id);

  const hacer = async (f: () => Promise<unknown>) => {
    setError(null);
    try {
      await f();
      cargar();
      return true;
    } catch (e) {
      setError(mensajeDe(e));
      return false;
    }
  };

  if (noExiste) {
    return (
      <div className="card vacio">
        <p className="nombre" style={{ color: 'var(--texto)' }}>Este mensaje no existe o no tienes acceso.</p>
        <Link to={`/proyectos/${projectId}/mensajes`}>Volver a los mensajes</Link>
      </div>
    );
  }
  if (!d) return error ? <p className="error">{error}</p> : <p className="cargando">Cargando…</p>;
  const { elemento: m, permisos } = d;

  return (
    <>
      <p className="meta" style={{ margin: '0 0 8px' }}>
        <Link to={`/proyectos/${projectId}/mensajes`}><Icono nombre="atras" tam={14} /> Mensajes</Link>
      </p>
      <article className="card mensaje">
        {editando ? (
          <>
            <label htmlFor="m-titulo">Título</label>
            <input id="m-titulo" maxLength={300} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            <label>Mensaje</label>
            <Editor valor={(m.body as JSONContent | null) ?? null} personas={personas} autoFocus etiqueta="Cuerpo del mensaje" onChange={(doc) => setCuerpo(doc)} />
            <div className="acciones" style={{ justifyContent: 'flex-end', marginBottom: 0 }}>
              <button type="button" className="btn btn-sec" onClick={() => setEditando(false)}>Cancelar</button>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const cambios: Record<string, unknown> = {};
                  if (titulo.trim() && titulo.trim() !== m.title) cambios.title = titulo.trim();
                  if (cuerpo) cambios.body = cuerpo;
                  if (!Object.keys(cambios).length || (await hacer(() => api(`/elementos/${m.id}`, { method: 'PATCH', body: cambios })))) setEditando(false);
                }}
              >
                Guardar
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="mensaje-titulo">{m.title}</h2>
            <div className="mensaje-autor">
              <span className="avatar gris">{iniciales(m.creator.name)}</span>
              <span className="meta">
                <b style={{ color: 'var(--texto)' }}>{m.creator.name}</b> · {cuando(m.createdAt)}
                {!esCliente(yo.rol) && (m.visibleToClients ? ' · visible para el cliente' : ' · interno')}
              </span>
            </div>
            {m.bodyHtml ? <Contenido html={m.bodyHtml} /> : <p className="meta">Sin texto.</p>}
            {(permisos.editar || permisos.papelera || permisos.cambiarVisibilidad) && (
              <div className="acciones" style={{ marginBottom: 0 }}>
                {permisos.editar && (
                  <button type="button" className="btn btn-sec btn-chico" onClick={() => { setTitulo(m.title ?? ''); setCuerpo(null); setEditando(true); }}>
                    <Icono nombre="editar" tam={14} />Editar
                  </button>
                )}
                {permisos.cambiarVisibilidad && (
                  <button type="button" className="btn btn-sec btn-chico" onClick={() => hacer(() => api(`/elementos/${m.id}`, { method: 'PATCH', body: { visibleToClients: !m.visibleToClients } }))}>
                    <Icono nombre="ojo" tam={14} />{m.visibleToClients ? 'Hacer interno' : 'Mostrar al cliente'}
                  </button>
                )}
                {permisos.papelera && (
                  <button
                    type="button"
                    className="btn-texto peligro"
                    onClick={async () => {
                      if (window.confirm('¿Mandar el mensaje y sus comentarios a la papelera?') && (await hacer(() => api(`/elementos/${m.id}/papelera`, { body: {} })))) {
                        navegar(`/proyectos/${projectId}/mensajes`);
                      }
                    }}
                  >
                    Papelera
                  </button>
                )}
              </div>
            )}
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <Comentarios key={`${m.id}-${m.visibleToClients}`} elementoId={m.id} projectId={projectId!} interno={interno} />
      </article>
    </>
  );
}
