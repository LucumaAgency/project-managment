import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { esCliente } from '@lucuma-pm/shared';
import { api, ErrorApi, subirBinario, tamano, urlArchivo, type DetalleArchivo, type ListadoArchivos } from '../api';
import Icono from '../componentes/Icono';
import Modal from '../componentes/Modal';
import { useYo } from '../contexto';

const mensajeDe = (e: unknown) => (e instanceof ErrorApi ? e.message : 'No se pudo conectar.');
const cuando = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });

interface Subida {
  id: string;
  nombre: string;
  avance: number;
  error?: string;
}

/** Archivos del proyecto: carpetas, subir (botón o arrastrando), y cada archivo con su vista. */
export default function Archivos() {
  const { id: projectId } = useParams<{ id: string }>();
  const yo = useYo();
  const cliente = esCliente(yo.rol);
  const [params, setParams] = useSearchParams();
  const carpeta = params.get('carpeta');
  const [d, setD] = useState<ListadoArchivos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const [visibles, setVisibles] = useState(false);
  const [encima, setEncima] = useState(false);
  const [creandoCarpeta, setCreandoCarpeta] = useState(false);
  const selector = useRef<HTMLInputElement>(null);

  const cargar = useCallback(() => {
    api<ListadoArchivos>(`/proyectos/${projectId}/archivos${carpeta ? `?carpeta=${carpeta}` : ''}`)
      .then(setD)
      .catch((e) => setError(mensajeDe(e)));
  }, [projectId, carpeta]);
  useEffect(() => {
    setD(null);
    cargar();
  }, [cargar]);

  async function subir(lista: FileList | File[]) {
    if (!d) return;
    for (const archivo of Array.from(lista)) {
      const id = `${archivo.name}-${Date.now()}-${Math.random()}`;
      if (archivo.size > d.almacenamiento.maxArchivo) {
        setSubidas((s) => [...s, { id, nombre: archivo.name, avance: 0, error: `Supera el máximo de ${tamano(d.almacenamiento.maxArchivo)}.` }]);
        continue;
      }
      setSubidas((s) => [...s, { id, nombre: archivo.name, avance: 0 }]);
      const q = new URLSearchParams({ nombre: archivo.name });
      if (carpeta) q.set('carpeta', carpeta);
      if (visibles && !cliente) q.set('visible', '1');
      try {
        await subirBinario<DetalleArchivo>(`/proyectos/${projectId}/archivos?${q}`, archivo, (f) =>
          setSubidas((s) => s.map((x) => (x.id === id ? { ...x, avance: f } : x)))
        );
        setSubidas((s) => s.filter((x) => x.id !== id));
        cargar();
      } catch (e) {
        setSubidas((s) => s.map((x) => (x.id === id ? { ...x, error: mensajeDe(e) } : x)));
      }
    }
  }

  const irA = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set('carpeta', id);
    else p.delete('carpeta');
    setParams(p);
  };

  if (!d) return error ? <p className="error">{error}</p> : <p className="cargando">Cargando…</p>;
  const vacio = d.carpetas.length === 0 && d.archivos.length === 0;

  return (
    <div
      className={`zona-archivos${encima ? ' encima' : ''}`}
      onDragOver={(e) => {
        if (!d.permisos.subir || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setEncima(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setEncima(false)}
      onDrop={(e) => {
        if (!d.permisos.subir) return;
        e.preventDefault();
        setEncima(false);
        if (e.dataTransfer.files.length) subir(e.dataTransfer.files);
      }}
    >
      <p className="meta" style={{ margin: '0 0 8px' }}>
        <Link to={`/proyectos/${projectId}`}><Icono nombre="atras" tam={14} /> Proyecto</Link>
      </p>
      <nav className="migas" aria-label="Carpetas">
        <button type="button" className="btn-texto" onClick={() => irA(null)}>Archivos</button>
        {d.ruta.map((c, i) => (
          <span key={c.id}>
            <span className="meta"> / </span>
            {i === d.ruta.length - 1 ? <b>{c.title}</b> : <button type="button" className="btn-texto" onClick={() => irA(c.id)}>{c.title}</button>}
          </span>
        ))}
      </nav>

      <div className="herramientas">
        <div className="empuja meta">
          {d.almacenamiento.maximo !== null
            ? `Usado: ${tamano(d.almacenamiento.usados)} de ${tamano(d.almacenamiento.maximo)}`
            : `Máximo por archivo: ${tamano(d.almacenamiento.maxArchivo)}`}
        </div>
        {d.permisos.crearCarpeta && (
          <button type="button" className="btn btn-sec" onClick={() => setCreandoCarpeta(true)}>
            <Icono nombre="carpeta" tam={16} />Nueva carpeta
          </button>
        )}
        {d.permisos.subir && (
          <>
            <button type="button" className="btn" onClick={() => selector.current?.click()}>
              <Icono nombre="subirArchivo" tam={16} />Subir archivos
            </button>
            <input ref={selector} type="file" multiple hidden onChange={(e) => e.target.files && subir(e.target.files).then(() => (e.target.value = ''))} />
          </>
        )}
      </div>
      {d.permisos.subir && !cliente && (
        <label className="casilla" style={{ marginTop: -4 }}>
          <input type="checkbox" checked={visibles} onChange={(e) => setVisibles(e.target.checked)} /> Lo que suba ahora, visible para el cliente
        </label>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {subidas.length > 0 && (
        <ul className="subidas">
          {subidas.map((s) => (
            <li key={s.id}>
              <span className="nombre">{s.nombre}</span>
              {s.error ? (
                <span className="error" style={{ margin: 0 }}>{s.error} <button type="button" className="btn-texto" onClick={() => setSubidas((x) => x.filter((y) => y.id !== s.id))}>Cerrar</button></span>
              ) : (
                <span className="progreso" style={{ margin: 0, flex: 1 }}><i style={{ width: `${Math.round(s.avance * 100)}%` }} /></span>
              )}
            </li>
          ))}
        </ul>
      )}

      {vacio ? (
        <div className="card vacio">
          <Icono nombre="archivo" tam={28} />
          <p className="nombre" style={{ margin: '8px 0 2px', color: 'var(--texto)' }}>{carpeta ? 'Esta carpeta está vacía' : 'Todavía no hay archivos'}</p>
          <p className="meta" style={{ margin: 0 }}>{d.permisos.subir ? 'Sube archivos con el botón o arrástralos aquí.' : 'Cuando el equipo comparta archivos contigo, aparecerán aquí.'}</p>
        </div>
      ) : (
        <div className="rejilla-archivos">
          {d.carpetas.map((c) => (
            <button key={c.id} type="button" className="tarjeta-archivo" onClick={() => irA(c.id)}>
              <span className="vista carpeta"><Icono nombre="carpeta" tam={34} /></span>
              <span className="nombre">{c.title}</span>
              <span className="meta">{c.elementos} {c.elementos === 1 ? 'elemento' : 'elementos'}{!cliente && c.visibleToClients ? ' · visible' : ''}</span>
            </button>
          ))}
          {d.archivos.map((a) => (
            <Link key={a.id} to={`/proyectos/${projectId}/archivos/${a.id}`} className="tarjeta-archivo">
              <span className="vista">
                {a.actual.enLinea && a.actual.contentType.startsWith('image/') ? (
                  <img src={urlArchivo(a.actual.blobId)} alt="" loading="lazy" />
                ) : (
                  <span className="tipo">{(a.title.split('.').pop() ?? '').slice(0, 4).toUpperCase() || 'ARCH'}</span>
                )}
              </span>
              <span className="nombre">{a.title}</span>
              <span className="meta">
                {tamano(a.actual.bytes)}
                {a.versiones > 1 ? ` · v${a.versiones}` : ''} · {cuando(a.updatedAt)}
                {a.comentarios > 0 ? ` · ${a.comentarios} com.` : ''}
                {!cliente && a.visibleToClients ? ' · visible' : ''}
              </span>
            </Link>
          ))}
        </div>
      )}

      {creandoCarpeta && (
        <NuevaCarpeta
          cliente={cliente}
          onCerrar={() => setCreandoCarpeta(false)}
          onCrear={async (title, visibleToClients) => {
            await api(`/proyectos/${projectId}/elementos`, { body: { type: 'folder', title, parentId: carpeta, visibleToClients } });
            setCreandoCarpeta(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function NuevaCarpeta({ cliente, onCerrar, onCrear }: { cliente: boolean; onCerrar: () => void; onCrear: (t: string, v: boolean) => Promise<void> }) {
  const [titulo, setTitulo] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal titulo="Nueva carpeta" onCerrar={onCerrar}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await onCrear(titulo, visible);
          } catch (err) {
            setError(mensajeDe(err));
          }
        }}
      >
        <label htmlFor="c-titulo">Nombre</label>
        <input id="c-titulo" required autoFocus maxLength={300} placeholder="Ej.: Entregables" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        {!cliente && (
          <label className="casilla">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Visible para el cliente
          </label>
        )}
        <p className="ayuda">Si la carpeta es interna, el cliente no ve nada de lo que tiene adentro.</p>
        {error && <p className="error">{error}</p>}
        <div className="acciones" style={{ justifyContent: 'flex-end', marginBottom: 0 }}>
          <button type="button" className="btn btn-sec" onClick={onCerrar}>Cancelar</button>
          <button className="btn">Crear carpeta</button>
        </div>
      </form>
    </Modal>
  );
}
