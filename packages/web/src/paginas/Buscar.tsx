import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ErrorApi, type Busqueda, type Marcas, type ResultadoBusqueda } from '../api';
import Icono, { type NombreIcono } from '../componentes/Icono';

const ICONO: Record<string, NombreIcono> = {
  todolist: 'tareas',
  todo: 'check',
  message: 'mensajes',
  comment: 'mensajes',
  folder: 'carpeta',
  upload: 'archivo',
};
const TIPO: Record<string, string> = {
  todolist: 'Lista',
  todo: 'Tarea',
  message: 'Mensaje',
  comment: 'Comentario',
  folder: 'Carpeta',
  upload: 'Archivo',
};

/** A dónde lleva un resultado (lo comentado, si es un comentario). */
export function enlaceResultado(r: ResultadoBusqueda): string {
  const p = `/proyectos/${r.proyecto.id}`;
  switch (r.abre.type) {
    case 'todo':
      return `${p}/tareas?tarea=${r.abre.id}`;
    case 'todolist':
      return `${p}/tareas`;
    case 'message':
      return `${p}/mensajes/${r.abre.id}`;
    case 'upload':
      return `${p}/archivos/${r.abre.id}`;
    case 'folder':
      return `${p}/archivos?carpeta=${r.abre.id}`;
    default:
      return p;
  }
}

/** Texto con las partes encontradas en <mark>. Las marcas vienen del servidor como posiciones. */
export function Resaltado({ texto, marcas }: { texto: string; marcas: Marcas }) {
  const partes: React.ReactNode[] = [];
  let i = 0;
  for (const [a, b] of marcas) {
    if (a < i || b > texto.length) continue;
    partes.push(<Fragment key={`t${i}`}>{texto.slice(i, a)}</Fragment>, <mark key={`m${a}`}>{texto.slice(a, b)}</mark>);
    i = b;
  }
  partes.push(<Fragment key="fin">{texto.slice(i)}</Fragment>);
  return <>{partes}</>;
}

/** Búsqueda en todo lo que puedo ver. La consulta vive en la URL (?q=) para poder volver atrás. */
export default function Buscar() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [texto, setTexto] = useState(q);
  const [d, setD] = useState<Busqueda | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => campo.current?.focus(), []);
  // Volver atrás cambia la URL: el campo la sigue.
  useEffect(() => setTexto(q), [q]);

  // Escribir actualiza la URL tras una pausa corta; la URL dispara la búsqueda.
  useEffect(() => {
    if (texto === q) return;
    const t = setTimeout(() => setParams(texto ? { q: texto } : {}, { replace: true }), 250);
    return () => clearTimeout(t);
  }, [texto, q, setParams]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setD(null);
      return;
    }
    let vigente = true;
    setCargando(true);
    setError(null);
    api<Busqueda>(`/buscar?q=${encodeURIComponent(q)}`)
      .then((r) => vigente && setD(r))
      .catch((e) => vigente && setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar.'))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [q]);

  const nada = d && !d.resultados.length && !d.proyectos.length;
  return (
    <div className="buscar">
      <form role="search" onSubmit={(e) => { e.preventDefault(); setParams(texto ? { q: texto } : {}, { replace: true }); }}>
        <label htmlFor="q" className="sr">Buscar</label>
        <div className="campo-buscar">
          <Icono nombre="buscar" tam={18} />
          <input
            id="q"
            ref={campo}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Buscar tareas, mensajes, comentarios, archivos…"
            maxLength={200}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>
      </form>

      {error && <p className="error" role="alert">{error}</p>}
      {!d && !cargando && <p className="meta">Escribe al menos dos letras. No importan las tildes ni las mayúsculas, y encuentra palabras a medio escribir.</p>}
      {cargando && !d && <p className="cargando">Buscando…</p>}
      {nada && (
        <div className="card vacio">
          <Icono nombre="buscar" tam={28} />
          <p className="nombre" style={{ margin: '8px 0 2px', color: 'var(--texto)' }}>Nada con «{q}»</p>
          <p className="meta" style={{ margin: 0 }}>Prueba con otra palabra o con menos palabras.</p>
        </div>
      )}

      {d && d.proyectos.length > 0 && (
        <>
          <h2 className="titulo-panel">Proyectos</h2>
          <ul className="resultados">
            {d.proyectos.map((p) => (
              <li key={p.id}>
                <Link to={`/proyectos/${p.id}`} className="resultado">
                  <Icono nombre="proyectos" tam={18} />
                  <span className="cuerpo">
                    <span className="nombre"><Resaltado texto={p.name} marcas={p.marcas} /></span>
                    {p.archivado && <span className="meta">Archivado</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {d && d.resultados.length > 0 && (
        <>
          {d.proyectos.length > 0 && <h2 className="titulo-panel">En los proyectos</h2>}
          <ul className="resultados" aria-busy={cargando}>
            {d.resultados.map((r) => (
              <li key={r.id}>
                <Link to={enlaceResultado(r)} className="resultado">
                  <Icono nombre={ICONO[r.type]} tam={18} />
                  <span className="cuerpo">
                    <span className={`nombre${r.completada ? ' tachada' : ''}`}><Resaltado texto={r.titulo.texto} marcas={r.titulo.marcas} /></span>
                    {r.fragmento && <span className="fragmento"><Resaltado texto={r.fragmento.texto} marcas={r.fragmento.marcas} /></span>}
                    <span className="meta">
                      {TIPO[r.type]}{r.completada ? ' completada' : ''} · {r.proyecto.name}{r.proyecto.archivado ? ' (archivado)' : ''} · {r.autor.name} ·{' '}
                      {new Date(r.updatedAt).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {d.resultados.length >= 30 && <p className="meta">Se muestran los 30 más relevantes. Agrega otra palabra para afinar.</p>}
        </>
      )}
    </div>
  );
}
