import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { esCliente } from '@lucuma-pm/shared';
import type { JSONContent } from '@tiptap/react';
import { api, ErrorApi, type ListaTareas, type Tarea, type TareaDetalle, type TareasProyecto } from '../api';
import Comentarios from '../componentes/Comentarios';
import Editor, { Contenido } from '../componentes/Editor';
import { useMencionables } from '../componentes/mencionables';
import { useLeerAvisosDe } from '../componentes/avisos';
import Icono from '../componentes/Icono';
import Modal from '../componentes/Modal';
import { useYo } from '../contexto';

const hoy = () => new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD en la hora local
function fechaCorta(dia: string) {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' });
}
function claseFecha(t: Tarea) {
  if (!t.dueOn || t.completedAt) return 'chip-gris';
  if (t.dueOn < hoy()) return 'chip-rojo';
  if (t.dueOn === hoy()) return 'chip-alerta';
  return 'chip-gris';
}
const mensajeDe = (e: unknown) => (e instanceof ErrorApi ? e.message : 'No se pudo conectar.');

/**
 * Tareas del proyecto: listas con sus tareas. Agregar rápido (Enter), completar con la
 * casilla, arrastrar para ordenar (o pasar a otra lista) y abrir una tarea para editarla.
 */
export default function Tareas() {
  const { id: projectId } = useParams<{ id: string }>();
  const yo = useYo();
  const [datos, setDatos] = useState<TareasProyecto | null>(null);
  const [nombreProyecto, setNombreProyecto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  // ?tarea=<id> abre esa tarea (enlaces de la actividad y, más adelante, de la bandeja).
  const abierta = params.get('tarea');
  const setAbierta = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set('tarea', id);
    else p.delete('tarea');
    setParams(p, { replace: !id });
  };
  const [creandoLista, setCreandoLista] = useState(false);
  const arrastrada = useRef<{ id: string; listaId: string } | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<TareasProyecto>(`/proyectos/${projectId}/tareas`)
      .then(setDatos)
      .catch((e) => setError(mensajeDe(e)));
  }, [projectId]);
  useEffect(() => {
    cargar();
    api<{ proyecto: { name: string } }>(`/proyectos/${projectId}`).then((r) => setNombreProyecto(r.proyecto.name)).catch(() => {});
  }, [cargar, projectId]);

  const accion = async (f: () => Promise<unknown>) => {
    setError(null);
    try {
      await f();
      cargar();
    } catch (e) {
      setError(mensajeDe(e));
    }
  };

  const puedeCompletar = (t: Tarea) =>
    !!datos?.permisos.completarCualquiera || t.creator.id === yo.usuario.id || t.assignees.some((a) => a.userId === yo.usuario.id);

  /** Soltar una tarea: queda justo antes de `antesDe` (o al final de la lista si es null). */
  function soltar(lista: ListaTareas, antesDe: string | null) {
    const a = arrastrada.current;
    arrastrada.current = null;
    setSobre(null);
    if (!a || a.id === antesDe) return;
    const abiertas = lista.tareas.filter((t) => !t.completedAt && t.id !== a.id);
    const i = antesDe ? abiertas.findIndex((t) => t.id === antesDe) : abiertas.length;
    const despuesDe = i <= 0 ? null : abiertas[i - 1].id;
    accion(() => api(`/elementos/${a.id}/mover`, { body: { parentId: lista.id, despuesDe } }));
  }

  if (!datos) return error ? <p className="error">{error}</p> : <p className="cargando">Cargando…</p>;

  return (
    <>
      <p className="meta" style={{ margin: '0 0 8px' }}>
        <Link to={`/proyectos/${projectId}`}><Icono nombre="atras" tam={14} /> {nombreProyecto || 'Proyecto'}</Link>
      </p>
      <div className="herramientas">
        <div className="empuja"><h2 style={{ fontSize: 20 }}>Tareas</h2></div>
        {datos.permisos.crearLista && (
          <button type="button" className="btn" onClick={() => setCreandoLista(true)}>
            <Icono nombre="mas" tam={16} />Nueva lista
          </button>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {datos.listas.length === 0 && (
        <div className="card vacio">
          <Icono nombre="tareas" tam={28} />
          <p className="nombre" style={{ margin: '8px 0 2px', color: 'var(--texto)' }}>Todavía no hay listas de tareas</p>
          <p className="meta" style={{ margin: 0 }}>
            {datos.permisos.crearLista ? 'Crea una lista (por ejemplo "Diseño" o "Lanzamiento") y agrégale tareas.' : 'Cuando el equipo comparta tareas contigo, aparecerán aquí.'}
          </p>
        </div>
      )}

      {datos.listas.map((l) => (
        <Lista
          key={l.id}
          lista={l}
          esCliente={esCliente(yo.rol)}
          puedeCompletar={puedeCompletar}
          sobre={sobre}
          onAbrir={setAbierta}
          onCompletar={(t) => accion(() => api(`/tareas/${t.id}/${t.completedAt ? 'reabrir' : 'completar'}`, { body: {} }))}
          onAgregar={(title) => accion(() => api(`/listas/${l.id}/tareas`, { body: { title } }))}
          onRenombrar={(title) => accion(() => api(`/elementos/${l.id}`, { method: 'PATCH', body: { title } }))}
          onPapelera={() => accion(() => api(`/elementos/${l.id}/papelera`, { body: {} }))}
          onVisibilidad={() => accion(() => api(`/elementos/${l.id}`, { method: 'PATCH', body: { visibleToClients: !l.visibleToClients } }))}
          onArrastrar={(t) => (arrastrada.current = { id: t.id, listaId: l.id })}
          onSobre={setSobre}
          onSoltar={(antesDe) => soltar(l, antesDe)}
        />
      ))}

      {creandoLista && (
        <NuevaLista
          esCliente={esCliente(yo.rol)}
          onCerrar={() => setCreandoLista(false)}
          onCrear={async (title, visibleToClients) => {
            await api(`/proyectos/${projectId}/listas`, { body: { title, visibleToClients } });
            setCreandoLista(false);
            cargar();
          }}
        />
      )}
      {abierta && (
        <DetalleTarea
          id={abierta}
          projectId={projectId!}
          listas={datos.listas}
          onCerrar={() => setAbierta(null)}
          onCambio={cargar}
        />
      )}
    </>
  );
}

interface PropsLista {
  lista: ListaTareas;
  esCliente: boolean;
  puedeCompletar: (t: Tarea) => boolean;
  sobre: string | null;
  onAbrir: (id: string) => void;
  onCompletar: (t: Tarea) => void;
  onAgregar: (title: string) => Promise<void> | void;
  onRenombrar: (title: string) => void;
  onPapelera: () => void;
  onVisibilidad: () => void;
  onArrastrar: (t: Tarea) => void;
  onSobre: (id: string | null) => void;
  onSoltar: (antesDe: string | null) => void;
}

function Lista(p: PropsLista) {
  const { lista } = p;
  const [nueva, setNueva] = useState('');
  const [verHechas, setVerHechas] = useState(false);
  const [menu, setMenu] = useState(false);
  const abiertas = lista.tareas.filter((t) => !t.completedAt);
  const hechas = lista.tareas.filter((t) => t.completedAt).sort((a, b) => (b.completedAt! > a.completedAt! ? 1 : -1));
  const total = lista.tareas.length;

  async function agregar(e: FormEvent) {
    e.preventDefault();
    const t = nueva.trim();
    if (!t) return;
    setNueva('');
    await p.onAgregar(t);
  }

  return (
    <section
      className={`card lista-tareas${p.sobre === `fin-${lista.id}` ? ' soltar-aqui' : ''}`}
      aria-label={lista.title}
      onDragOver={(e) => {
        if (!lista.permisos.mover) return;
        e.preventDefault();
        if (p.sobre === null || !p.sobre.startsWith('t-')) p.onSobre(`fin-${lista.id}`);
      }}
      onDrop={(e) => {
        e.preventDefault();
        p.onSoltar(null);
      }}
    >
      <div className="fila" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h3 className="titulo-lista">{lista.title}</h3>
          <div className="meta">
            {total === 0 ? 'Sin tareas' : `${hechas.length} de ${total} completadas`}
            {!p.esCliente && lista.visibleToClients && <span className="chip chip-verde" style={{ marginLeft: 8 }}><Icono nombre="ojo" tam={12} />Visible para el cliente</span>}
          </div>
        </div>
        {(lista.permisos.editar || lista.permisos.papelera || lista.permisos.visibilidad) && (
          <div className="menu-acciones">
            <button type="button" className="btn btn-sec btn-chico" aria-label={`Acciones de ${lista.title}`} onClick={() => setMenu((v) => !v)}>
              <Icono nombre="puntos" tam={16} />
            </button>
            {menu && (
              <div className="usuario-menu" role="menu">
                {lista.permisos.editar && (
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); const t = window.prompt('Nombre de la lista', lista.title); if (t?.trim()) p.onRenombrar(t.trim()); }}>
                    <Icono nombre="editar" tam={16} />Renombrar
                  </button>
                )}
                {lista.permisos.visibilidad && (
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); p.onVisibilidad(); }}>
                    <Icono nombre="ojo" tam={16} />{lista.visibleToClients ? 'Hacer interna (el cliente deja de verla)' : 'Mostrar al cliente'}
                  </button>
                )}
                {lista.permisos.papelera && (
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); if (window.confirm(`¿Mandar «${lista.title}» y sus tareas a la papelera?`)) p.onPapelera(); }}>
                    <Icono nombre="papelera" tam={16} />Mandar a la papelera
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {lista.bodyHtml && <Contenido html={lista.bodyHtml} className="meta descripcion-lista" />}
      {total > 0 && <div className="progreso" aria-hidden="true"><i style={{ width: `${(hechas.length / total) * 100}%` }} /></div>}

      <ul className="tareas">
        {abiertas.map((t) => (
          <FilaTarea key={t.id} t={t} {...p} />
        ))}
      </ul>

      {lista.permisos.agregar && (
        <form className="agregar-tarea" onSubmit={agregar}>
          <Icono nombre="mas" tam={16} />
          <input aria-label={`Agregar tarea a ${lista.title}`} placeholder="Agregar una tarea y presionar Enter" maxLength={300} value={nueva} onChange={(e) => setNueva(e.target.value)} />
        </form>
      )}

      {hechas.length > 0 && (
        <>
          <button type="button" className="btn-texto ver-hechas" onClick={() => setVerHechas((v) => !v)}>
            {verHechas ? 'Ocultar completadas' : `Ver completadas (${hechas.length})`}
          </button>
          {verHechas && (
            <ul className={`tareas hechas${lista.permisos.mover ? ' con-asa' : ''}`}>
              {hechas.map((t) => (
                <FilaTarea key={t.id} t={t} {...p} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function FilaTarea({ t, lista, esCliente: cliente, puedeCompletar, sobre, onAbrir, onCompletar, onArrastrar, onSobre, onSoltar }: PropsLista & { t: Tarea }) {
  const arrastrable = lista.permisos.mover && !t.completedAt;
  return (
    <li
      className={`tarea${t.completedAt ? ' hecha' : ''}${sobre === `t-${t.id}` ? ' soltar-aqui' : ''}`}
      draggable={arrastrable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', t.id);
        onArrastrar(t);
      }}
      onDragOver={(e) => {
        if (!arrastrable) return;
        e.preventDefault();
        e.stopPropagation();
        onSobre(`t-${t.id}`);
      }}
      onDrop={(e) => {
        if (!arrastrable) return;
        e.preventDefault();
        e.stopPropagation();
        onSoltar(t.id);
      }}
      onDragEnd={() => onSobre(null)}
    >
      {arrastrable && <span className="asa" aria-hidden="true"><Icono nombre="arrastrar" tam={14} /></span>}
      <input
        type="checkbox"
        aria-label={t.completedAt ? `Reabrir «${t.title}»` : `Completar «${t.title}»`}
        checked={!!t.completedAt}
        disabled={!puedeCompletar(t)}
        onChange={() => onCompletar(t)}
      />
      <button type="button" className="tarea-cuerpo" onClick={() => onAbrir(t.id)}>
        <span className="tarea-titulo">{t.title}</span>
        <span className="tarea-meta">
          {t.assignees.length > 0 && <span>{t.assignees.map((a) => a.name.split(' ')[0]).join(', ')}</span>}
          {t.dueOn && <span className={`chip ${claseFecha(t)}`}>{fechaCorta(t.dueOn)}</span>}
          {t.tieneNotas && <Icono nombre="notas" tam={13} />}
          {!!t.comentarios && <span className="con-icono" title={`${t.comentarios} comentarios`}><Icono nombre="mensajes" tam={13} />{t.comentarios}</span>}
          {!cliente && t.visibleToClients && <span title="Visible para el cliente"><Icono nombre="ojo" tam={13} /></span>}
          {t.completedBy && <span>Hecha por {t.completedBy.name.split(' ')[0]}</span>}
        </span>
      </button>
    </li>
  );
}

function NuevaLista({ esCliente: cliente, onCerrar, onCrear }: { esCliente: boolean; onCerrar: () => void; onCrear: (t: string, v: boolean) => Promise<void> }) {
  const [titulo, setTitulo] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal titulo="Nueva lista de tareas" onCerrar={onCerrar}>
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
        <label htmlFor="l-titulo">Nombre</label>
        <input id="l-titulo" required autoFocus maxLength={300} placeholder="Ej.: Diseño de la web" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        {!cliente && (
          <label className="casilla">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Visible para el cliente
          </label>
        )}
        <p className="ayuda">Si no es visible, el cliente no ve la lista ni sus tareas.</p>
        {error && <p className="error">{error}</p>}
        <div className="acciones" style={{ justifyContent: 'flex-end', marginBottom: 0 }}>
          <button type="button" className="btn btn-sec" onClick={onCerrar}>Cancelar</button>
          <button className="btn">Crear lista</button>
        </div>
      </form>
    </Modal>
  );
}

/** Panel de una tarea: título, notas, responsables, fecha, visibilidad, mover, completar, papelera. */
function DetalleTarea({ id, projectId, listas, onCerrar, onCambio }: { id: string; projectId: string; listas: ListaTareas[]; onCerrar: () => void; onCambio: () => void }) {
  const [d, setD] = useState<TareaDetalle | null>(null);
  const [titulo, setTitulo] = useState('');
  const [notas, setNotas] = useState<JSONContent | null>(null);
  const [notasCambiaron, setNotasCambiaron] = useState(false);
  const [dia, setDia] = useState('');
  const [responsables, setResponsables] = useState<string[]>([]);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  useLeerAvisosDe(id);

  useEffect(() => {
    api<TareaDetalle>(`/tareas/${id}`)
      .then((r) => {
        setD(r);
        setTitulo(r.tarea.title);
        setDia(r.tarea.dueOn ?? '');
        setResponsables(r.tarea.assignees.map((a) => a.userId));
        setVisible(r.tarea.visibleToClients);
      })
      .catch((e) => setError(mensajeDe(e)));
  }, [id]);
  const lista = listas.find((l) => l.id === d?.tarea.listaId);
  const visibleEfectiva = visible && !!lista?.visibleToClients;
  const personas = useMencionables(projectId, !visibleEfectiva);

  if (!d) {
    return (
      <Modal titulo="Tarea" onCerrar={onCerrar}>
        {error ? <p className="error">{error}</p> : <p className="cargando">Cargando…</p>}
      </Modal>
    );
  }
  const { tarea: t, permisos } = d;

  async function guardar(e?: FormEvent) {
    e?.preventDefault();
    setGuardando(true);
    setError(null);
    const cambios: Record<string, unknown> = {};
    if (permisos.editar && titulo.trim() !== t.title) cambios.title = titulo.trim();
    if (permisos.editar && notasCambiaron) cambios.body = notas;
    if (permisos.cambiarVisibilidad && visible !== t.visibleToClients) cambios.visibleToClients = visible;
    if (permisos.asignar && (dia || null) !== t.dueOn) cambios.dueOn = dia || null;
    const antes = t.assignees.map((a) => a.userId).sort().join();
    // Si pasó a interna, los clientes responsables salen solos: no mandarlos.
    const validos = responsables.filter((r) => personas.some((p) => p.userId === r));
    if (permisos.asignar && validos.slice().sort().join() !== antes) cambios.assigneeIds = validos;
    try {
      if (Object.keys(cambios).length) await api(`/tareas/${id}`, { method: 'PATCH', body: cambios });
      onCambio();
      onCerrar();
    } catch (err) {
      setError(mensajeDe(err));
      setGuardando(false);
    }
  }

  const simple = async (f: () => Promise<unknown>, cerrar = false) => {
    try {
      await f();
      onCambio();
      if (cerrar) onCerrar();
      else setD(await api<TareaDetalle>(`/tareas/${id}`));
    } catch (err) {
      setError(mensajeDe(err));
    }
  };

  const abiertasDe = (l: ListaTareas) => l.tareas.filter((x) => !x.completedAt && x.id !== t.id);
  const mismas = lista ? abiertasDe(lista) : [];
  const indice = lista ? lista.tareas.filter((x) => !x.completedAt).findIndex((x) => x.id === t.id) : -1;

  return (
    <Modal titulo={t.completedAt ? 'Tarea completada' : 'Tarea'} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="detalle-tarea">
        <label htmlFor="t-titulo">Tarea</label>
        <input id="t-titulo" required maxLength={300} value={titulo} readOnly={!permisos.editar} onChange={(e) => setTitulo(e.target.value)} />

        <label>Notas</label>
        {permisos.editar ? (
          <Editor
            valor={(t.body as JSONContent | null) ?? null}
            personas={personas}
            placeholder="Detalles, enlaces, @menciones…"
            etiqueta="Notas de la tarea"
            onChange={(doc) => {
              setNotas(doc);
              setNotasCambiaron(true);
            }}
          />
        ) : t.bodyHtml ? (
          <div className="card" style={{ marginBottom: 0 }}><Contenido html={t.bodyHtml} /></div>
        ) : (
          <p className="meta">Sin notas.</p>
        )}

        <div className="rejilla-2">
          <div>
            <label htmlFor="t-dia">Fecha de entrega</label>
            {permisos.asignar ? (
              <input id="t-dia" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
            ) : (
              <p className="meta" id="t-dia">{t.dueOn ? fechaCorta(t.dueOn) : 'Sin fecha'}</p>
            )}
          </div>
          {permisos.cambiarVisibilidad && (
            <div>
              <label>Cliente</label>
              <label className="casilla" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Visible para el cliente
              </label>
              {visible && lista && !lista.visibleToClients && <p className="ayuda">La lista es interna: el cliente no la verá hasta que la lista sea visible.</p>}
            </div>
          )}
        </div>

        <label>Responsables</label>
        {permisos.asignar ? (
          <div className="opciones-personas">
            {personas.map((p) => (
              <label key={p.userId} className="casilla">
                <input
                  type="checkbox"
                  checked={responsables.includes(p.userId)}
                  onChange={(e) => setResponsables((r) => (e.target.checked ? [...r, p.userId] : r.filter((x) => x !== p.userId)))}
                />
                {p.name}
              </label>
            ))}
          </div>
        ) : (
          <p className="meta">{t.assignees.length ? t.assignees.map((a) => a.name).join(', ') : 'Sin responsable'}</p>
        )}

        {permisos.mover && lista && !t.completedAt && (
          <>
            <label htmlFor="t-lista">Lista</label>
            <div className="sumar">
              <select
                id="t-lista"
                value={lista.id}
                onChange={(e) => simple(() => api(`/elementos/${t.id}/mover`, { body: { parentId: e.target.value, despuesDe: abiertasDe(listas.find((l) => l.id === e.target.value)!).at(-1)?.id ?? null } }), true)}
              >
                {listas.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
              <button type="button" className="btn btn-sec" aria-label="Subir" disabled={indice <= 0} onClick={() => simple(() => api(`/elementos/${t.id}/mover`, { body: { despuesDe: indice >= 2 ? mismas[indice - 2].id : null } }))}>
                <Icono nombre="subirFlecha" tam={16} />
              </button>
              <button type="button" className="btn btn-sec" aria-label="Bajar" disabled={indice === -1 || indice >= mismas.length} onClick={() => simple(() => api(`/elementos/${t.id}/mover`, { body: { despuesDe: mismas[indice].id } }))}>
                <Icono nombre="bajarFlecha" tam={16} />
              </button>
            </div>
          </>
        )}

        <p className="ayuda" style={{ marginTop: 14 }}>
          Creada por {t.creator.name}
          {t.completedBy && ` · completada por ${t.completedBy.name}`}
        </p>
        {error && <p className="error" role="alert">{error}</p>}

        <div className="acciones" style={{ marginBottom: 0 }}>
          {permisos.completar && (
            <button type="button" className="btn btn-sec" onClick={() => simple(() => api(`/tareas/${t.id}/${t.completedAt ? 'reabrir' : 'completar'}`, { body: {} }))}>
              <Icono nombre="check" tam={16} />{t.completedAt ? 'Reabrir' : 'Completar'}
            </button>
          )}
          {permisos.papelera && (
            <button type="button" className="btn-texto peligro" onClick={() => window.confirm('¿Mandar la tarea a la papelera?') && simple(() => api(`/elementos/${t.id}/papelera`, { body: {} }), true)}>
              Papelera
            </button>
          )}
          <span style={{ flex: 1 }} />
          {(permisos.editar || permisos.asignar || permisos.cambiarVisibilidad) && (
            <button className="btn" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          )}
        </div>
      </form>
      <Comentarios elementoId={t.id} projectId={projectId} interno={!(t.visibleToClients && lista?.visibleToClients)} onCambio={onCambio} />
    </Modal>
  );
}
