import { useRef, useState, type FormEvent } from 'react';
import { api, ErrorApi, type Columna, type ListaTareas, type PasoVista, type Tarea, type TareaDetalle } from '../api';
import Icono from './Icono';
import Modal from './Modal';

const mensajeDe = (e: unknown) => (e instanceof ErrorApi ? e.message : 'No se pudo conectar.');
const hoy = () => new Date().toLocaleDateString('en-CA');
function fechaCorta(dia: string) {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
}
const resumenPasos = (p: Tarea['pasos']) => (Array.isArray(p) ? { total: p.length, hechos: p.filter((x) => x.hecho).length } : p);

/**
 * Una lista vista como tablero (D-68): una columna por etapa, tarjetas que el equipo arrastra
 * (en celular se mueven desde la tarjeta: "Columna"). En la columna de revisión, el cliente
 * aprueba o pide cambios.
 */
export function Tablero({
  lista,
  esCliente,
  onAbrir,
  onCambio,
  onError,
}: {
  lista: ListaTareas;
  esCliente: boolean;
  onAbrir: (id: string) => void;
  onCambio: () => void;
  onError: (m: string | null) => void;
}) {
  const columnas = lista.tablero!.columnas;
  const arrastrada = useRef<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [nueva, setNueva] = useState<Record<string, string>>({});
  const de = (c: string) => lista.tareas.filter((t) => t.columna === c);

  const hacer = async (f: () => Promise<unknown>) => {
    onError(null);
    try {
      await f();
      onCambio();
    } catch (e) {
      onError(mensajeDe(e));
    }
  };

  async function agregar(e: FormEvent, columna: Columna & { id: string }) {
    e.preventDefault();
    const title = (nueva[columna.id] ?? '').trim();
    if (!title) return;
    setNueva((n) => ({ ...n, [columna.id]: '' }));
    await hacer(async () => {
      const r = await api<{ tarea: Tarea }>(`/listas/${lista.id}/tareas`, { body: { title, visibleToClients: lista.visibleToClients } });
      if (columna.id !== columnas[0].id) await api(`/tareas/${r.tarea.id}/columna`, { body: { columnaId: columna.id } });
    });
  }

  return (
    <div className="tablero" role="list" aria-label={`Tablero de ${lista.title}`}>
      {columnas.map((c) => {
        const tarjetas = de(c.id);
        return (
          <section
            key={c.id}
            role="listitem"
            className={`columna${c.tipo ? ` columna-${c.tipo}` : ''}${sobre === c.id ? ' soltar-aqui' : ''}`}
            aria-label={c.nombre}
            onDragOver={(e) => {
              if (!lista.permisos.mover || !arrastrada.current) return;
              e.preventDefault();
              setSobre(c.id);
            }}
            onDragLeave={() => setSobre((s) => (s === c.id ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              const id = arrastrada.current;
              arrastrada.current = null;
              setSobre(null);
              const t = lista.tareas.find((x) => x.id === id);
              if (t && t.columna !== c.id) hacer(() => api(`/tareas/${t.id}/columna`, { body: { columnaId: c.id } }));
            }}
          >
            <div className="columna-cab">
              <span className="columna-nombre">{c.nombre}</span>
              <span className="meta">{tarjetas.length}</span>
            </div>
            {c.tipo === 'revision' && <p className="ayuda columna-ayuda">{esCliente ? 'Revisa y aprueba, o pide cambios.' : 'Aquí el cliente aprueba o pide cambios.'}</p>}
            <ul className="tarjetas">
              {tarjetas.map((t) => (
                <Tarjeta
                  key={t.id}
                  t={t}
                  arrastrable={lista.permisos.mover}
                  enRevision={c.tipo === 'revision'}
                  esCliente={esCliente}
                  onAbrir={() => onAbrir(t.id)}
                  onArrastrar={() => (arrastrada.current = t.id)}
                  onAprobar={() => hacer(() => api(`/tareas/${t.id}/aprobar`, { body: {} }))}
                  onPedirCambios={() => {
                    const comentario = window.prompt('¿Qué hay que cambiar?');
                    if (comentario?.trim()) hacer(() => api(`/tareas/${t.id}/pedir-cambios`, { body: { comentario } }));
                  }}
                />
              ))}
            </ul>
            {lista.permisos.agregar && !esCliente && c.tipo !== 'hecho' && (
              <form className="agregar-tarjeta" onSubmit={(e) => agregar(e, c)}>
                <input aria-label={`Agregar tarjeta en ${c.nombre}`} placeholder="+ Agregar tarjeta" maxLength={300} value={nueva[c.id] ?? ''} onChange={(e) => setNueva((n) => ({ ...n, [c.id]: e.target.value }))} />
              </form>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Tarjeta({
  t,
  arrastrable,
  enRevision,
  esCliente,
  onAbrir,
  onArrastrar,
  onAprobar,
  onPedirCambios,
}: {
  t: Tarea;
  arrastrable: boolean;
  enRevision: boolean;
  esCliente: boolean;
  onAbrir: () => void;
  onArrastrar: () => void;
  onAprobar: () => void;
  onPedirCambios: () => void;
}) {
  const pasos = resumenPasos(t.pasos);
  const vencida = t.dueOn && !t.completedAt && t.dueOn < hoy();
  return (
    <li
      className={`tarjeta${t.completedAt ? ' hecha' : ''}`}
      draggable={arrastrable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', t.id);
        onArrastrar();
      }}
    >
      <button type="button" className="tarjeta-cuerpo" onClick={onAbrir}>
        <span className="tarjeta-titulo">{t.title}</span>
        <span className="tarea-meta">
          {t.dueOn && <span className={`chip ${vencida ? 'chip-rojo' : t.dueOn === hoy() ? 'chip-alerta' : 'chip-gris'}`}>{fechaCorta(t.dueOn)}</span>}
          {pasos.total > 0 && <span className={`chip ${pasos.hechos === pasos.total ? 'chip-verde' : 'chip-gris'}`}><Icono nombre="tareas" tam={11} />{pasos.hechos}/{pasos.total}</span>}
          {t.pide > 0 && <span className="chip chip-gris">Pide {t.respondidos ?? 0}/{t.pide}</span>}
          {t.espera && <span className="chip chip-gris">Espera</span>}
          {!!t.comentarios && <span className="con-icono"><Icono nombre="mensajes" tam={12} />{t.comentarios}</span>}
          {!esCliente && t.visibleToClients && <span title="Visible para el cliente"><Icono nombre="ojo" tam={12} /></span>}
          {t.assignees.length > 0 && <span className="tarjeta-personas">{t.assignees.map((a) => a.name.split(' ')[0]).join(', ')}</span>}
        </span>
      </button>
      {enRevision && esCliente && (
        <div className="tarjeta-revision">
          <button type="button" className="btn btn-chico" onClick={onAprobar}><Icono nombre="check" tam={14} />Aprobar</button>
          <button type="button" className="btn btn-sec btn-chico" onClick={onPedirCambios}>Pedir cambios</button>
        </div>
      )}
    </li>
  );
}

/** Editar las columnas: nombre, orden, cuál es la de revisión. «Hecho» va siempre al final. */
export function EditorColumnas({ lista, onCerrar, onGuardado }: { lista: ListaTareas; onCerrar: () => void; onGuardado: () => void }) {
  const inicial = lista.tablero!.columnas;
  const [cols, setCols] = useState<Columna[]>(inicial.filter((c) => c.tipo !== 'hecho'));
  const [hecho, setHecho] = useState(inicial.find((c) => c.tipo === 'hecho')!.nombre);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cambiar = (n: number, c: Partial<Columna>) => setCols((xs) => xs.map((x, i) => (i === n ? { ...x, ...c } : x)));
  const mover = (n: number, d: -1 | 1) =>
    setCols((xs) => {
      const ys = [...xs];
      [ys[n], ys[n + d]] = [ys[n + d], ys[n]];
      return ys;
    });

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const h = inicial.find((c) => c.tipo === 'hecho')!;
      await api(`/listas/${lista.id}/columnas`, { method: 'PUT', body: { columnas: [...cols, { id: h.id, nombre: hecho, tipo: 'hecho' }] } });
      onGuardado();
    } catch (err) {
      setError(mensajeDe(err));
      setGuardando(false);
    }
  }

  const quitadas = inicial.filter((c) => c.tipo !== 'hecho' && !cols.some((x) => x.id === c.id));
  return (
    <Modal titulo="Columnas del tablero" onCerrar={onCerrar}>
      <form onSubmit={guardar}>
        <p className="ayuda" style={{ marginTop: 0 }}>Las etapas por las que pasa cada tarjeta. La última siempre es la de terminado: llegar ahí completa la tarea.</p>
        <div className="editor-campos">
          {cols.map((c, n) => (
            <div key={c.id ?? `n${n}`} className="editor-campo">
              <input aria-label={`Columna ${n + 1}`} maxLength={40} value={c.nombre} onChange={(e) => cambiar(n, { nombre: e.target.value })} />
              <label className="casilla" title="Aquí el cliente aprueba o pide cambios">
                <input
                  type="checkbox"
                  checked={c.tipo === 'revision'}
                  onChange={(e) => setCols((xs) => xs.map((x, i) => ({ ...x, tipo: i === n && e.target.checked ? 'revision' : undefined })))}
                /> Revisión del cliente
              </label>
              <span className="editor-campo-botones">
                <button type="button" className="btn btn-sec btn-chico" aria-label="Subir columna" disabled={n === 0} onClick={() => mover(n, -1)}><Icono nombre="subirFlecha" tam={14} /></button>
                <button type="button" className="btn btn-sec btn-chico" aria-label="Bajar columna" disabled={n === cols.length - 1} onClick={() => mover(n, 1)}><Icono nombre="bajarFlecha" tam={14} /></button>
                <button type="button" className="btn btn-sec btn-chico" aria-label="Quitar columna" disabled={cols.length === 1} onClick={() => setCols((xs) => xs.filter((_, i) => i !== n))}><Icono nombre="papelera" tam={14} /></button>
              </span>
            </div>
          ))}
          <button type="button" className="btn-texto" onClick={() => setCols((xs) => [...xs, { nombre: '' }])}>+ Agregar columna</button>
        </div>
        <label htmlFor="col-hecho">Última columna (terminado)</label>
        <input id="col-hecho" maxLength={40} value={hecho} onChange={(e) => setHecho(e.target.value)} />
        {quitadas.length > 0 && <p className="ayuda">Las tarjetas de {quitadas.map((c) => `«${c.nombre}»`).join(', ')} pasan a la primera columna.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="acciones" style={{ justifyContent: 'flex-end', marginBottom: 0 }}>
          <button type="button" className="btn btn-sec" onClick={onCerrar}>Cancelar</button>
          <button className="btn" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** En el detalle de una tarjeta: en qué columna está (el equipo la cambia) y la revisión del cliente. */
export function ColumnaDeTarea({ d, esCliente, onCambio }: { d: TareaDetalle; esCliente: boolean; onCambio: (r: TareaDetalle) => void }) {
  const tab = d.tarea.tablero!;
  const actual = tab.columnas.find((c) => c.id === tab.columna)!;
  const [error, setError] = useState<string | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  const [comentario, setComentario] = useState('');
  const hacer = async (ruta: string, body: object) => {
    setError(null);
    try {
      onCambio(await api<TareaDetalle>(ruta, { body }));
      setPidiendo(false);
      setComentario('');
    } catch (e) {
      setError(mensajeDe(e));
    }
  };
  return (
    <div className="columna-tarea">
      <label htmlFor="t-columna">Columna</label>
      {d.permisos.mover ? (
        <select id="t-columna" value={tab.columna} onChange={(e) => hacer(`/tareas/${d.tarea.id}/columna`, { columnaId: e.target.value })}>
          {tab.columnas.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      ) : (
        <p className="meta" id="t-columna">{actual.nombre}</p>
      )}
      {actual.tipo === 'revision' && esCliente && (
        <div className="revision-cliente">
          <p style={{ margin: '0 0 8px' }}>El equipo espera tu revisión.</p>
          {pidiendo ? (
            <>
              <textarea aria-label="Qué hay que cambiar" rows={3} maxLength={5000} placeholder="Cuéntanos qué cambiar" value={comentario} onChange={(e) => setComentario(e.target.value)} />
              <div className="acciones" style={{ marginBottom: 0 }}>
                <button type="button" className="btn btn-sec" onClick={() => setPidiendo(false)}>Cancelar</button>
                <button type="button" className="btn" disabled={!comentario.trim()} onClick={() => hacer(`/tareas/${d.tarea.id}/pedir-cambios`, { comentario })}>Enviar cambios</button>
              </div>
            </>
          ) : (
            <div className="acciones" style={{ marginBottom: 0 }}>
              <button type="button" className="btn" onClick={() => hacer(`/tareas/${d.tarea.id}/aprobar`, {})}><Icono nombre="check" tam={16} />Aprobar</button>
              <button type="button" className="btn btn-sec" onClick={() => setPidiendo(true)}>Pedir cambios</button>
            </div>
          )}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

/** Pasos dentro de la tarea: el equipo los agrega y quita; quien la tiene asignada los marca. */
export function Pasos({ d, onCambio }: { d: TareaDetalle; onCambio: (r: TareaDetalle) => void }) {
  const pasos = (Array.isArray(d.tarea.pasos) ? d.tarea.pasos : []) as PasoVista[];
  const [nuevo, setNuevo] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!pasos.length && !d.permisos.pasos) return null;
  const guardar = async (lista: { id?: string; texto: string; hecho?: boolean }[]) => {
    setError(null);
    try {
      onCambio(await api<TareaDetalle>(`/tareas/${d.tarea.id}/pasos`, { method: 'PUT', body: { pasos: lista } }));
    } catch (e) {
      setError(mensajeDe(e));
    }
  };
  const base = pasos.map((p) => ({ id: p.id, texto: p.texto, hecho: p.hecho }));
  const hechos = pasos.filter((p) => p.hecho).length;
  return (
    <section className="pasos" aria-label="Pasos">
      <div className="fila" style={{ alignItems: 'baseline' }}>
        <label style={{ margin: 0 }}>Pasos</label>
        {pasos.length > 0 && <span className="meta">{hechos} de {pasos.length}</span>}
      </div>
      <ul className="lista-pasos">
        {pasos.map((p, i) => (
          <li key={p.id} className={p.hecho ? 'hecho' : ''}>
            <label className="casilla">
              <input type="checkbox" checked={p.hecho} disabled={!d.permisos.marcarPasos} onChange={() => guardar(base.map((x, j) => (j === i ? { ...x, hecho: !x.hecho } : x)))} />
              <span>{p.texto}</span>
            </label>
            {p.hecho && p.por && <span className="ayuda" style={{ margin: 0 }}>{p.por.split(' ')[0]}</span>}
            {d.permisos.pasos && (
              <button type="button" className="btn-texto" aria-label={`Quitar paso ${p.texto}`} onClick={() => guardar(base.filter((_, j) => j !== i))}>×</button>
            )}
          </li>
        ))}
      </ul>
      {d.permisos.pasos && (
        <form
          className="agregar-tarea"
          onSubmit={(e) => {
            e.preventDefault();
            const texto = nuevo.trim();
            if (!texto) return;
            setNuevo('');
            guardar([...base, { texto }]);
          }}
        >
          <Icono nombre="mas" tam={16} />
          <input aria-label="Agregar un paso" placeholder="Agregar un paso y presionar Enter" maxLength={200} value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
