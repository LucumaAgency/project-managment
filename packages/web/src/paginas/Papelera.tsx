import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ErrorApi } from '../api';
import Icono, { type NombreIcono } from '../componentes/Icono';

interface Borrado {
  id: string;
  type: string;
  title: string | null;
  bodyText: string | null;
  trashedAt: string;
  seBorraEl: string;
  trashedBy: { id: string; name: string } | null;
  parent: { type: string; title: string | null } | null;
}

const ICONO: Record<string, NombreIcono> = { todolist: 'tareas', todo: 'check', message: 'mensajes', comment: 'mensajes', folder: 'carpeta', upload: 'archivo' };
const TIPO: Record<string, string> = { todolist: 'Lista', todo: 'Tarea', message: 'Mensaje', comment: 'Comentario', folder: 'Carpeta', upload: 'Archivo' };
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
const mensajeDe = (e: unknown) => (e instanceof ErrorApi ? e.message : 'No se pudo conectar.');

function nombreDe(b: Borrado) {
  if (b.type === 'comment') {
    const texto = (b.bodyText ?? '').replace(/\s+/g, ' ').trim();
    return `«${texto.length > 80 ? `${texto.slice(0, 80)}…` : texto || 'comentario'}»`;
  }
  return b.title || 'Sin título';
}

/** Lo borrado de un proyecto (dueños y administradores): restaurar, y cuándo se borra solo. */
export default function Papelera() {
  const { id: projectId } = useParams<{ id: string }>();
  const [d, setD] = useState<{ elementos: Borrado[]; dias: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restaurando, setRestaurando] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<{ elementos: Borrado[]; dias: number }>(`/proyectos/${projectId}/papelera`)
      .then(setD)
      .catch((e) => setError(mensajeDe(e)));
  }, [projectId]);
  useEffect(cargar, [cargar]);

  async function restaurar(id: string) {
    setRestaurando(id);
    setError(null);
    try {
      await api(`/elementos/${id}/restaurar`, { body: {} });
      cargar();
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setRestaurando(null);
    }
  }

  if (!d) return error ? <p className="error">{error}</p> : <p className="cargando">Cargando…</p>;
  return (
    <>
      <p className="meta" style={{ margin: '0 0 8px' }}>
        <Link to={`/proyectos/${projectId}`}><Icono nombre="atras" tam={14} /> Proyecto</Link>
      </p>
      <p className="meta" style={{ marginTop: 0 }}>
        Lo que se manda a la papelera se borra para siempre a los {d.dias} días, con todo lo que tiene dentro (también los archivos).
        Restaurar algo lo devuelve con su contenido.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {d.elementos.length === 0 ? (
        <div className="card vacio">
          <Icono nombre="papelera" tam={28} />
          <p className="nombre" style={{ margin: '8px 0 2px', color: 'var(--texto)' }}>La papelera está vacía</p>
        </div>
      ) : (
        <ul className="papelera-lista">
          {d.elementos.map((b) => (
            <li key={b.id}>
              <Icono nombre={ICONO[b.type] ?? 'archivo'} tam={18} />
              <span className="cuerpo">
                <span className="nombre">{nombreDe(b)}</span>
                <span className="meta">
                  {TIPO[b.type] ?? b.type}
                  {b.parent?.title ? ` en «${b.parent.title}»` : ''} · borrado por {b.trashedBy?.name ?? '—'} el {fecha(b.trashedAt)} · se borra para siempre el {fecha(b.seBorraEl)}
                </span>
              </span>
              <button type="button" className="btn btn-sec btn-chico" disabled={restaurando === b.id} onClick={() => restaurar(b.id)}>
                {restaurando === b.id ? 'Restaurando…' : 'Restaurar'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
