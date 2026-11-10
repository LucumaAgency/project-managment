import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
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

/** Archivos del proyecto: carpetas, subir (botón o arrastrando), enlaces a archivos de afuera (D-78), documentos en Markdown (D-82) y cada archivo con su vista. */
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
  const [creandoEnlace, setCreandoEnlace] = useState(false);
  const [creandoDoc, setCreandoDoc] = useState(false);
  const navegar = useNavigate();
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
  const vacio = d.carpetas.length === 0 && d.archivos.length === 0 && d.enlaces.length === 0 && d.documentos.length === 0;

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

      {d.carpeta && !cliente && (
        <p className={`aviso${d.carpeta.visibleParaCliente ? '' : ' ambar'}`} style={{ marginTop: 0, marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Icono nombre="ojo" tam={15} />
          <span style={{ flex: 1 }}>
            {d.carpeta.visibleParaCliente
              ? 'El cliente ve esta carpeta (y lo que tenga marcado como visible adentro).'
              : d.carpeta.visibleToClients
                ? 'Esta carpeta está marcada visible, pero está dentro de otra interna: el cliente no la ve.'
                : 'Carpeta interna: el cliente no ve nada de lo que hay adentro.'}
          </span>
          {d.carpeta.cambiarVisibilidad && (
            <button type="button" className="btn btn-sec btn-chico" onClick={async () => { await api(`/elementos/${d.carpeta!.id}`, { method: 'PATCH', body: { visibleToClients: !d.carpeta!.visibleToClients } }); cargar(); }}>
              {d.carpeta.visibleToClients ? 'Hacer interna' : 'Mostrar al cliente'}
            </button>
          )}
        </p>
      )}

      <div className="herramientas">
        <div className="empuja meta">
          {d.almacenamiento.maximo !== null && d.almacenamiento.usados !== null
            ? `Usado: ${tamano(d.almacenamiento.usados)} de ${tamano(d.almacenamiento.maximo)}`
            : `Máximo por archivo: ${tamano(d.almacenamiento.maxArchivo)}`}
        </div>
        {d.permisos.crearCarpeta && (
          <button type="button" className="btn btn-sec" onClick={() => setCreandoCarpeta(true)}>
            <Icono nombre="carpeta" tam={16} />Nueva carpeta
          </button>
        )}
        {d.permisos.subir && (
          <button type="button" className="btn btn-sec" onClick={() => setCreandoDoc(true)}>
            <Icono nombre="documento" tam={16} />Nuevo documento
          </button>
        )}
        {d.permisos.subir && (
          <button type="button" className="btn btn-sec" onClick={() => setCreandoEnlace(true)}>
            <Icono nombre="enlace" tam={16} />Agregar enlace
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
          <p className="meta" style={{ margin: 0 }}>{d.permisos.subir ? 'Sube archivos con el botón o arrástralos aquí. Si el archivo está en otro lado (Drive, una galería), agrega su enlace. Para escribir una guía o documentación, crea un documento.' : 'Cuando el equipo comparta archivos contigo, aparecerán aquí.'}</p>
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
          {d.documentos.map((doc) => (
            <Link key={doc.id} to={`/proyectos/${projectId}/archivos/${doc.id}`} className="tarjeta-archivo">
              <span className="vista documento"><Icono nombre="documento" tam={30} /><span className="tipo-md">MD</span></span>
              <span className="nombre">{doc.title}</span>
              <span className="meta">
                Documento · {cuando(doc.updatedAt)}
                {doc.comentarios > 0 ? ` · ${doc.comentarios} com.` : ''}
                {!cliente && doc.visibleToClients ? ' · visible' : ''}
              </span>
            </Link>
          ))}
          {d.enlaces.map((e) => (
            <Link key={e.id} to={`/proyectos/${projectId}/archivos/${e.id}`} className="tarjeta-archivo">
              <span className="vista enlace"><Icono nombre="enlace" tam={30} /></span>
              <span className="nombre">{e.title}</span>
              <span className="meta">
                {e.sitio || 'Enlace'} · {cuando(e.updatedAt)}
                {e.comentarios > 0 ? ` · ${e.comentarios} com.` : ''}
                {!cliente && e.visibleToClients ? ' · visible' : ''}
              </span>
            </Link>
          ))}
        </div>
      )}

      {creandoDoc && (
        <NuevoDocumento
          cliente={cliente}
          visibleInicial={visibles}
          onCerrar={() => setCreandoDoc(false)}
          onCrear={async (titulo, contenido, visible) => {
            const r = await api<DetalleArchivo>(`/proyectos/${projectId}/documentos`, { body: { titulo, contenido, carpeta, visible } });
            // Uno nuevo se abre listo para escribir; uno importado, para leerlo.
            navegar(`/proyectos/${projectId}/archivos/${r.archivo.id}${contenido ? '' : '?editar=1'}`);
          }}
        />
      )}

      {creandoEnlace && (
        <NuevoEnlace
          cliente={cliente}
          visibleInicial={visibles}
          onCerrar={() => setCreandoEnlace(false)}
          onCrear={async (titulo, url, visible) => {
            await api(`/proyectos/${projectId}/enlaces`, { body: { titulo, url, carpeta, visible } });
            setCreandoEnlace(false);
            cargar();
          }}
        />
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

/** Enlace a un archivo que vive afuera: nombre y dirección (solo http o https). */
function NuevoEnlace({ cliente, visibleInicial, onCerrar, onCrear }: { cliente: boolean; visibleInicial: boolean; onCerrar: () => void; onCrear: (t: string, u: string, v: boolean) => Promise<void> }) {
  const [titulo, setTitulo] = useState('');
  const [url, setUrl] = useState('');
  const [visible, setVisible] = useState(visibleInicial);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  return (
    <Modal titulo="Agregar enlace" onCerrar={onCerrar}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setEnviando(true);
          setError(null);
          try {
            await onCrear(titulo, url, visible);
          } catch (err) {
            setError(mensajeDe(err));
            setEnviando(false);
          }
        }}
      >
        <label htmlFor="e-url">Dirección</label>
        <input
          id="e-url"
          type="url"
          required
          autoFocus
          maxLength={2000}
          placeholder="https://drive.google.com/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => {
            // Si no le pusieron nombre, se sugiere el final de la dirección.
            if (titulo.trim() || !url.trim()) return;
            try {
              const u = new URL(url.trim());
              const ultimo = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '');
              setTitulo(ultimo && ultimo.length < 120 && ultimo.includes('.') ? ultimo : u.hostname.replace(/^www\./, ''));
            } catch {
              /* dirección incompleta: que la corrijan */
            }
          }}
        />
        <label htmlFor="e-titulo">Nombre</label>
        <input id="e-titulo" required maxLength={300} placeholder="Ej.: Reporte de octubre (PDF)" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        {!cliente && (
          <label className="casilla">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Visible para el cliente
          </label>
        )}
        <p className="ayuda">El archivo sigue donde está (Drive, una galería, otra web). Aquí queda la referencia, con sus comentarios.</p>
        {error && <p className="error">{error}</p>}
        <div className="acciones" style={{ justifyContent: 'flex-end', marginBottom: 0 }}>
          <button type="button" className="btn btn-sec" onClick={onCerrar}>Cancelar</button>
          <button className="btn" disabled={enviando}>{enviando ? 'Agregando…' : 'Agregar enlace'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Documento en Markdown (D-82): nombre y, si quieren, un .md que ya tengan para importarlo. */
function NuevoDocumento({ cliente, visibleInicial, onCerrar, onCrear }: { cliente: boolean; visibleInicial: boolean; onCerrar: () => void; onCrear: (t: string, c: string, v: boolean) => Promise<void> }) {
  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  const [importado, setImportado] = useState<string | null>(null);
  const [visible, setVisible] = useState(visibleInicial);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const selector = useRef<HTMLInputElement>(null);

  async function importar(f: File) {
    setError(null);
    if (f.size > 600_000) return setError('Ese archivo es demasiado grande para un documento.');
    const texto = await f.text();
    setContenido(texto);
    setImportado(f.name);
    // Nombre: el primer "# Título" del archivo; si no tiene, el nombre del archivo.
    const h1 = /^#\s+(.+?)\s*#*\s*$/m.exec(texto)?.[1];
    if (!titulo.trim()) setTitulo((h1 ?? f.name.replace(/\.(md|markdown|txt)$/i, '')).slice(0, 300));
  }

  return (
    <Modal titulo="Nuevo documento" onCerrar={onCerrar}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setEnviando(true);
          setError(null);
          try {
            await onCrear(titulo.trim(), contenido, visible);
          } catch (err) {
            setError(mensajeDe(err));
            setEnviando(false);
          }
        }}
      >
        <label htmlFor="d-titulo">Nombre</label>
        <input id="d-titulo" required autoFocus maxLength={300} placeholder="Ej.: Guía de marca, Manual de despliegue" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        {!cliente && (
          <label className="casilla">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Visible para el cliente
          </label>
        )}
        <p className="ayuda">
          Se escribe en Markdown (# títulos, **negrita**, listas, tablas) y se lee ya formateado.{' '}
          {importado ? (
            <>Se importará <b>{importado}</b>. <button type="button" className="btn-texto" onClick={() => { setContenido(''); setImportado(null); }}>Quitar</button></>
          ) : (
            <button type="button" className="btn-texto" onClick={() => selector.current?.click()}>¿Ya tienes un .md? Impórtalo</button>
          )}
        </p>
        <input ref={selector} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importar(f); }} />
        {error && <p className="error">{error}</p>}
        <div className="acciones" style={{ justifyContent: 'flex-end', marginBottom: 0 }}>
          <button type="button" className="btn btn-sec" onClick={onCerrar}>Cancelar</button>
          <button className="btn" disabled={enviando}>{enviando ? 'Creando…' : importado ? 'Importar documento' : 'Crear y escribir'}</button>
        </div>
      </form>
    </Modal>
  );
}
