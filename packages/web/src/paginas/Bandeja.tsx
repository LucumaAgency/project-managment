import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ErrorApi, type Aviso } from '../api';
import { enlaceDe, frase } from '../componentes/Actividad';
import { useAvisos } from '../componentes/avisos';
import Icono from '../componentes/Icono';
import { iniciales } from '../componentes/Marca';

function motivo(a: Aviso) {
  if (a.reason === 'mentioned') return 'Te mencionaron';
  if (a.reason === 'assigned') return 'Te asignaron';
  if (a.reason === 'due_soon') return 'Vence pronto';
  const e = a.evento;
  if (e.elemento?.type === 'comment') return 'Comentario nuevo';
  if (e.action === 'completed') return 'Completada';
  if (e.action === 'version_uploaded') return 'Versión nueva';
  if (e.elemento?.type === 'message' && e.action === 'created') return 'Mensaje nuevo';
  return 'Novedad';
}
const hora = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** La bandeja: menciones, asignaciones y novedades de lo que sigues, en esta cuenta. */
export default function Bandeja() {
  const navegar = useNavigate();
  const { refrescar } = useAvisos();
  const [params, setParams] = useSearchParams();
  const soloNoLeidos = params.get('ver') === 'no-leidos';
  const [avisos, setAvisos] = useState<Aviso[] | null>(null);
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const traer = useCallback(
    (antes?: string) => {
      const q = new URLSearchParams();
      if (soloNoLeidos) q.set('no-leidos', '1');
      if (antes) q.set('antes', antes);
      api<{ avisos: Aviso[]; siguiente: string | null }>(`/bandeja?${q}`)
        .then((r) => {
          setAvisos((a) => (antes && a ? [...a, ...r.avisos] : r.avisos));
          setSiguiente(r.siguiente);
        })
        .catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar.'));
    },
    [soloNoLeidos]
  );
  useEffect(() => {
    setAvisos(null);
    traer();
  }, [traer]);

  async function abrir(a: Aviso) {
    if (!a.leido) await api(`/bandeja/${a.id}/leido`, { body: {} }).catch(() => {});
    refrescar();
    const destino = a.abre ? enlaceDe(a.proyecto.id, a.evento) : null;
    if (destino) navegar(destino);
    else setAvisos((xs) => xs?.map((x) => (x.id === a.id ? { ...x, leido: true } : x)) ?? null);
  }

  async function leerTodo() {
    await api('/bandeja/leer-todo', { body: {} });
    refrescar();
    traer();
  }

  return (
    <>
      <div className="herramientas">
        <div className="empuja"><h2 style={{ fontSize: 20 }}>Bandeja</h2></div>
        <button type="button" className="btn btn-sec" onClick={leerTodo}><Icono nombre="check" tam={16} />Marcar todo como leído</button>
      </div>
      <div className="pestanas" role="tablist">
        {[['todos', 'Todos'], ['no-leidos', 'No leídos']].map(([clave, nombre]) => (
          <button
            key={clave}
            type="button"
            role="tab"
            aria-selected={(clave === 'no-leidos') === soloNoLeidos}
            className={(clave === 'no-leidos') === soloNoLeidos ? 'activa' : ''}
            onClick={() => setParams(clave === 'no-leidos' ? { ver: 'no-leidos' } : {})}
          >
            {nombre}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {!avisos ? (
        !error && <p className="cargando">Cargando…</p>
      ) : avisos.length === 0 ? (
        <div className="card vacio">
          <Icono nombre="bandeja" tam={28} />
          <p className="nombre" style={{ margin: '8px 0 2px', color: 'var(--texto)' }}>{soloNoLeidos ? 'Estás al día' : 'Todavía no tienes avisos'}</p>
          <p className="meta" style={{ margin: 0 }}>Aquí llegan las menciones, lo que te asignan y las novedades de lo que sigues.</p>
        </div>
      ) : (
        <ul className="lista-avisos">
          {avisos.map((a) => (
            <li key={a.id}>
              <button type="button" className={`aviso-fila${a.leido ? '' : ' no-leido'}`} onClick={() => abrir(a)}>
                <span className="punto" aria-label={a.leido ? undefined : 'No leído'} />
                <span className="avatar gris">{iniciales(a.evento.actor.name)}</span>
                <span className="datos">
                  <span className="aviso-cab">
                    <span className={`chip${a.reason === 'mentioned' || a.reason === 'assigned' ? '' : ' chip-gris'}`}>{motivo(a)}</span>
                    <span className="meta">{a.proyecto.name} · {hora(a.createdAt)}</span>
                  </span>
                  <span className="aviso-texto"><b>{a.evento.actor.name}</b> {frase(a.evento)}</span>
                  {a.evento.elemento?.extracto && <span className="meta extracto">“{a.evento.elemento.extracto}”</span>}
                  {!a.abre && <span className="meta">Ya no está disponible.</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {siguiente && (
        <button type="button" className="btn btn-sec btn-bloque" style={{ marginTop: 12 }} onClick={() => traer(siguiente)}>Ver más</button>
      )}
    </>
  );
}
