import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ErrorApi, type Evento } from '../api';
import ListaActividad from '../componentes/Actividad';
import Icono from '../componentes/Icono';

/** Toda la actividad del proyecto, de a 30. */
export default function Actividad() {
  const { id: projectId } = useParams<{ id: string }>();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const traer = useCallback(
    (antes?: string) => {
      setCargando(true);
      api<{ eventos: Evento[]; siguiente: string | null }>(`/proyectos/${projectId}/actividad${antes ? `?antes=${encodeURIComponent(antes)}` : ''}`)
        .then((r) => {
          setEventos((e) => (antes ? [...e, ...r.eventos] : r.eventos));
          setSiguiente(r.siguiente);
        })
        .catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar.'))
        .finally(() => setCargando(false));
    },
    [projectId]
  );
  useEffect(() => traer(), [traer]);

  return (
    <>
      <p className="meta" style={{ margin: '0 0 8px' }}>
        <Link to={`/proyectos/${projectId}`}><Icono nombre="atras" tam={14} /> Proyecto</Link>
      </p>
      <h2 style={{ fontSize: 20, margin: '4px 0 12px' }}>Actividad</h2>
      {error && <p className="error">{error}</p>}
      <div className="card">
        {eventos.length === 0 && !cargando ? <p className="meta">Todavía no hay actividad.</p> : <ListaActividad eventos={eventos} projectId={projectId!} />}
        {siguiente && (
          <button type="button" className="btn btn-sec btn-bloque" disabled={cargando} onClick={() => traer(siguiente)} style={{ marginTop: 12 }}>
            {cargando ? 'Cargando…' : 'Ver más'}
          </button>
        )}
      </div>
    </>
  );
}
