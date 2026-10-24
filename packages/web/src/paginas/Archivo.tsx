import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { esCliente } from '@lucuma-pm/shared';
import { api, ErrorApi, subirBinario, tamano, urlArchivo, type DetalleArchivo } from '../api';
import Comentarios from '../componentes/Comentarios';
import Icono from '../componentes/Icono';
import { useYo } from '../contexto';

const mensajeDe = (e: unknown) => (e instanceof ErrorApi ? e.message : 'No se pudo conectar.');
const cuando = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Un archivo: vista previa (imagen o PDF), versiones, nueva versión, visibilidad y comentarios. */
export default function Archivo() {
  const { id: projectId, archivoId } = useParams<{ id: string; archivoId: string }>();
  const yo = useYo();
  const navegar = useNavigate();
  const [d, setD] = useState<DetalleArchivo | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [avance, setAvance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selector = useRef<HTMLInputElement>(null);

  const cargar = useCallback(() => {
    api<DetalleArchivo>(`/archivos/${archivoId}`)
      .then(setD)
      .catch((e) => (e instanceof ErrorApi && e.status === 404 ? setNoExiste(true) : setError(mensajeDe(e))));
  }, [archivoId]);
  useEffect(cargar, [cargar]);

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

  const volver = d?.archivo.carpetaId ? `/proyectos/${projectId}/archivos?carpeta=${d.archivo.carpetaId}` : `/proyectos/${projectId}/archivos`;
  if (noExiste) {
    return (
      <div className="card vacio">
        <p className="nombre" style={{ color: 'var(--texto)' }}>Este archivo no existe o no tienes acceso.</p>
        <Link to={`/proyectos/${projectId}/archivos`}>Volver a los archivos</Link>
      </div>
    );
  }
  if (!d) return error ? <p className="error">{error}</p> : <p className="cargando">Cargando…</p>;
  const { archivo: a, permisos } = d;
  const actual = a.versiones[0];

  async function nuevaVersion(archivo: File) {
    const nota = window.prompt('¿Qué cambió en esta versión? (opcional)') ?? '';
    setAvance(0);
    await hacer(() => subirBinario(`/archivos/${a.id}/versiones?${new URLSearchParams({ nombre: archivo.name, ...(nota ? { nota } : {}) })}`, archivo, setAvance));
    setAvance(null);
  }

  return (
    <>
      <p className="meta" style={{ margin: '0 0 8px' }}>
        <Link to={volver}><Icono nombre="atras" tam={14} /> Archivos</Link>
      </p>
      <article className="card">
        <div className="fila" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h2 className="mensaje-titulo">{a.title}</h2>
            <p className="meta" style={{ margin: 0 }}>
              v{actual.version} · {tamano(actual.bytes)} · subido por {actual.uploadedBy.name} el {cuando(actual.createdAt)}
              {!esCliente(yo.rol) && (a.visibleToClients ? ' · visible para el cliente' : ' · interno')}
            </p>
          </div>
          <a className="btn" href={urlArchivo(actual.blobId, true)}>
            <Icono nombre="descargar" tam={16} />Descargar
          </a>
        </div>

        <div className="vista-previa">
          {actual.enLinea && actual.contentType.startsWith('image/') && <img src={urlArchivo(actual.blobId)} alt={a.title} />}
          {actual.enLinea && actual.contentType === 'application/pdf' && <iframe src={urlArchivo(actual.blobId)} title={a.title} />}
          {!actual.enLinea && <p className="meta">Vista previa no disponible para este tipo de archivo. Descárgalo para abrirlo.</p>}
        </div>

        <div className="acciones">
          {permisos.nuevaVersion && (
            <>
              <button type="button" className="btn btn-sec btn-chico" disabled={avance !== null} onClick={() => selector.current?.click()}>
                <Icono nombre="subirArchivo" tam={14} />{avance !== null ? `Subiendo… ${Math.round(avance * 100)}%` : 'Subir nueva versión'}
              </button>
              <input ref={selector} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) nuevaVersion(f); }} />
            </>
          )}
          {permisos.renombrar && (
            <button type="button" className="btn btn-sec btn-chico" onClick={() => { const t = window.prompt('Nombre del archivo', a.title); if (t?.trim()) hacer(() => api(`/elementos/${a.id}`, { method: 'PATCH', body: { title: t.trim() } })); }}>
              <Icono nombre="editar" tam={14} />Renombrar
            </button>
          )}
          {permisos.cambiarVisibilidad && (
            <button type="button" className="btn btn-sec btn-chico" onClick={() => hacer(() => api(`/elementos/${a.id}`, { method: 'PATCH', body: { visibleToClients: !a.visibleToClients } }))}>
              <Icono nombre="ojo" tam={14} />{a.visibleToClients ? 'Hacer interno' : 'Mostrar al cliente'}
            </button>
          )}
          {permisos.papelera && (
            <button type="button" className="btn-texto peligro" onClick={async () => { if (window.confirm('¿Mandar el archivo (con todas sus versiones) a la papelera?') && (await hacer(() => api(`/elementos/${a.id}/papelera`, { body: {} })))) navegar(volver); }}>
              Papelera
            </button>
          )}
        </div>
        {error && <p className="error" role="alert">{error}</p>}

        {a.versiones.length > 1 && (
          <>
            <h3 className="titulo-panel" style={{ marginTop: 12 }}>Versiones</h3>
            <ul className="versiones">
              {a.versiones.map((v) => (
                <li key={v.version}>
                  <b>v{v.version}</b>
                  <span className="datos">
                    <span>{v.filename} · {tamano(v.bytes)}</span>
                    <span className="meta">{v.uploadedBy.name} · {cuando(v.createdAt)}{v.nota ? ` — ${v.nota}` : ''}</span>
                  </span>
                  <a className="btn-texto" href={urlArchivo(v.blobId, true)}>Descargar</a>
                </li>
              ))}
            </ul>
          </>
        )}

        <Comentarios key={`${a.id}-${a.visibleToClients}`} elementoId={a.id} projectId={projectId!} interno={!a.visibleToClients} />
      </article>
    </>
  );
}
