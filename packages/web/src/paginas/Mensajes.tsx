import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { esCliente } from '@lucuma-pm/shared';
import type { JSONContent } from '@tiptap/react';
import { api, ErrorApi, type MensajeResumen } from '../api';
import Editor from '../componentes/Editor';
import { useMencionables } from '../componentes/mencionables';
import Icono from '../componentes/Icono';
import { iniciales } from '../componentes/Marca';
import { useYo } from '../contexto';

const cuando = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
const mensajeDe = (e: unknown) => (e instanceof ErrorApi ? e.message : 'No se pudo conectar.');

/** Mensajes del proyecto: los que tuvieron movimiento reciente, primero. */
export default function Mensajes() {
  const { id: projectId } = useParams<{ id: string }>();
  const yo = useYo();
  const navegar = useNavigate();
  const [d, setD] = useState<{ mensajes: MensajeResumen[]; puedePublicar: boolean } | null>(null);
  const [nombreProyecto, setNombreProyecto] = useState('');
  const [escribiendo, setEscribiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ mensajes: MensajeResumen[]; puedePublicar: boolean }>(`/proyectos/${projectId}/mensajes`).then(setD).catch((e) => setError(mensajeDe(e)));
    api<{ proyecto: { name: string } }>(`/proyectos/${projectId}`).then((r) => setNombreProyecto(r.proyecto.name)).catch(() => {});
  }, [projectId]);

  if (!d) return error ? <p className="error">{error}</p> : <p className="cargando">Cargando…</p>;
  return (
    <>
      <p className="meta" style={{ margin: '0 0 8px' }}>
        <Link to={`/proyectos/${projectId}`}><Icono nombre="atras" tam={14} /> {nombreProyecto || 'Proyecto'}</Link>
      </p>
      <div className="herramientas">
        <div className="empuja"><h2 style={{ fontSize: 20 }}>Mensajes</h2></div>
        {d.puedePublicar && !escribiendo && (
          <button type="button" className="btn" onClick={() => setEscribiendo(true)}>
            <Icono nombre="mas" tam={16} />Nuevo mensaje
          </button>
        )}
      </div>

      {escribiendo && (
        <NuevoMensaje
          projectId={projectId!}
          esCliente={esCliente(yo.rol)}
          onCancelar={() => setEscribiendo(false)}
          onPublicado={(id) => navegar(`/proyectos/${projectId}/mensajes/${id}`)}
        />
      )}

      {d.mensajes.length === 0 && !escribiendo ? (
        <div className="card vacio">
          <Icono nombre="mensajes" tam={28} />
          <p className="nombre" style={{ margin: '8px 0 2px', color: 'var(--texto)' }}>Todavía no hay mensajes</p>
          <p className="meta" style={{ margin: 0 }}>Un mensaje sirve para anuncios, briefs o temas para conversar con comentarios.</p>
        </div>
      ) : (
        <ul className="lista-mensajes">
          {d.mensajes.map((m) => (
            <li key={m.id}>
              <Link to={`/proyectos/${projectId}/mensajes/${m.id}`} className="mensaje-fila">
                <span className="avatar gris">{iniciales(m.creator.name)}</span>
                <span className="datos">
                  <span className="nombre">{m.title}</span>
                  <span className="meta extracto">{m.creator.name} · {cuando(m.createdAt)}{m.extracto ? ` — ${m.extracto}` : ''}</span>
                </span>
                <span className="meta mensaje-lado">
                  {!esCliente(yo.rol) && m.visibleToClients && <span title="Visible para el cliente"><Icono nombre="ojo" tam={14} /></span>}
                  {m.comentarios > 0 && <span className="con-icono"><Icono nombre="mensajes" tam={14} />{m.comentarios}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function NuevoMensaje({ projectId, esCliente: cliente, onCancelar, onPublicado }: { projectId: string; esCliente: boolean; onCancelar: () => void; onPublicado: (id: string) => void }) {
  const [titulo, setTitulo] = useState('');
  const [cuerpo, setCuerpo] = useState<JSONContent | null>(null);
  const [visible, setVisible] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const yo = useYo();
  const personas = useMencionables(projectId, !(cliente || visible), yo.usuario.id);

  async function publicar(e?: FormEvent) {
    e?.preventDefault();
    if (!titulo.trim()) return setError('Ponle un título.');
    setEnviando(true);
    setError(null);
    try {
      const r = await api<{ elemento: { id: string } }>(`/proyectos/${projectId}/elementos`, {
        body: { type: 'message', title: titulo, body: cuerpo ?? undefined, visibleToClients: visible },
      });
      onPublicado(r.elemento.id);
    } catch (err) {
      setError(mensajeDe(err));
      setEnviando(false);
    }
  }

  return (
    <form className="card nuevo-mensaje" onSubmit={publicar}>
      <label htmlFor="m-titulo">Título</label>
      <input id="m-titulo" required autoFocus maxLength={300} placeholder="Ej.: Brief de la campaña de lanzamiento" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      <label>Mensaje</label>
      <Editor personas={personas} placeholder="Escribe el mensaje. Usa @ para avisar a alguien." etiqueta="Cuerpo del mensaje" onChange={(doc) => setCuerpo(doc)} onEnviar={publicar} />
      {!cliente && (
        <label className="casilla" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Visible para el cliente
        </label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones" style={{ justifyContent: 'flex-end', marginBottom: 0 }}>
        <button type="button" className="btn btn-sec" onClick={onCancelar}>Cancelar</button>
        <button className="btn" disabled={enviando}>{enviando ? 'Publicando…' : 'Publicar'}</button>
      </div>
    </form>
  );
}
