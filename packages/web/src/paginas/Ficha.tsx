import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ErrorApi, type Ficha as DatosFicha } from '../api';
import { ValorCampo } from '../componentes/Campos';
import Icono from '../componentes/Icono';

/**
 * Ficha del cliente (D-65): todo lo que respondieron en las tareas que piden algo, en un solo
 * lugar. Se toca una tarea para responder o corregir.
 */
export default function Ficha() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<DatosFicha | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<DatosFicha>(`/proyectos/${id}/ficha`).then(setD).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar.'));
  }, [id]);

  if (!d) return error ? <p className="error">{error}</p> : <p className="cargando">Cargando…</p>;
  const total = d.tareas.reduce((n, t) => n + t.campos.length, 0);
  const listos = d.tareas.reduce((n, t) => n + t.respondidos, 0);
  return (
    <>
      <p className="meta" style={{ margin: '0 0 8px' }}>
        <Link to={`/proyectos/${id}`}><Icono nombre="atras" tam={14} /> {d.proyecto.name}</Link>
      </p>
      <div className="herramientas">
        <div className="empuja">
          <h2 style={{ fontSize: 20 }}>Ficha del cliente</h2>
          <p className="meta" style={{ margin: '2px 0 0' }}>{total ? `${listos} de ${total} respondidos` : 'Ninguna tarea pide nada todavía.'}</p>
        </div>
      </div>
      {total > 0 && <div className="progreso" aria-hidden="true" style={{ marginBottom: 16 }}><i style={{ width: `${(listos / total) * 100}%` }} /></div>}
      {d.tareas.map((t) => (
        <section key={t.id} className="card ficha-bloque" aria-label={t.title}>
          <div className="fila" style={{ alignItems: 'baseline' }}>
            <h3 className="titulo-lista" style={{ margin: 0 }}>
              <Link to={`/proyectos/${id}/tareas?tarea=${t.id}`}>{t.title}</Link>
            </h3>
            <span className={`chip ${t.completada ? 'chip-verde' : 'chip-gris'}`}>{t.completada ? 'Completa' : `${t.respondidos} de ${t.campos.length}`}</span>
          </div>
          {t.lista && <p className="meta" style={{ margin: '2px 0 8px' }}>{t.lista}</p>}
          <dl className="ficha-campos">
            {t.campos.map((c) => (
              <div key={c.id}>
                <dt>{c.etiqueta}</dt>
                <dd><ValorCampo campo={c} /></dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </>
  );
}
