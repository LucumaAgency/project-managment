import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { NOMBRE_ROL, esCliente } from '@lucuma-pm/shared';
import { api, ErrorApi, urlArchivo, type Evento, type InvitacionCreada, type Personas as DatosPersonas, type ProyectoDetalle, type VistaPrevia } from '../api';
import ListaActividad from '../componentes/Actividad';
import { olvidarMencionables } from '../componentes/mencionables';
import EnlaceCompartir, { mensajeInvitacion } from '../componentes/EnlaceCompartir';
import Icono, { type NombreIcono } from '../componentes/Icono';
import { iniciales } from '../componentes/Marca';
import Modal from '../componentes/Modal';
import { useYo } from '../contexto';

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long' });

const SECCIONES: { clave: keyof ProyectoDetalle['secciones']; nombre: string; icono: NombreIcono; vacia: string; uno: string; varios: string; ruta?: string }[] = [
  { clave: 'tareas', nombre: 'Tareas', icono: 'tareas', vacia: 'Las listas de tareas del proyecto aparecerán aquí.', uno: 'lista', varios: 'listas', ruta: 'tareas' },
  { clave: 'mensajes', nombre: 'Mensajes', icono: 'mensajes', vacia: 'Anuncios y temas para conversar con el equipo y el cliente.', uno: 'mensaje', varios: 'mensajes', ruta: 'mensajes' },
  { clave: 'archivos', nombre: 'Archivos', icono: 'archivo', vacia: 'Entregables, briefs y documentos, con sus versiones.', uno: 'elemento', varios: 'elementos', ruta: 'archivos' },
  // Solo aparece si alguna tarea pide algo (D-65).
  { clave: 'ficha', nombre: 'Ficha del cliente', icono: 'ficha', vacia: '', uno: 'tarea', varios: 'tareas', ruta: 'ficha' },
];

/** Página de un proyecto: cabecera, personas, acciones y sus secciones. */
export default function Proyecto() {
  const { id } = useParams<{ id: string }>();
  const yo = useYo();
  const navegar = useNavigate();
  const [d, setD] = useState<ProyectoDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editando, setEditando] = useState(false);
  const [viendoPersonas, setViendoPersonas] = useState(false);
  const [recientes, setRecientes] = useState<Evento[] | null>(null);

  const cargar = useCallback(() => {
    api<ProyectoDetalle>(`/proyectos/${id}`)
      .then(setD)
      .catch((e) => {
        if (e instanceof ErrorApi && e.status === 404) setNoExiste(true);
        else setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar.');
      });
  }, [id]);
  useEffect(cargar, [cargar]);
  useEffect(() => {
    api<{ eventos: Evento[] }>(`/proyectos/${id}/actividad?limite=8`).then((r) => setRecientes(r.eventos)).catch(() => setRecientes([]));
  }, [id]);

  async function transicion(ruta: 'archivar' | 'reactivar' | 'papelera' | 'restaurar', confirmar?: string) {
    setMenu(false);
    if (confirmar && !window.confirm(confirmar)) return;
    try {
      await api(`/proyectos/${id}/${ruta}`, { body: {} });
      if (ruta === 'papelera') return navegar('/');
      cargar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar.');
    }
  }

  if (noExiste) {
    return (
      <div className="card vacio">
        <p className="nombre" style={{ color: 'var(--texto)' }}>Este proyecto no existe o no tienes acceso.</p>
        <Link to="/">Volver a los proyectos</Link>
      </div>
    );
  }
  if (!d) return error ? <p className="error">{error}</p> : <p className="cargando">Cargando…</p>;

  const { proyecto: p, permisos } = d;
  const hayAcciones = permisos.editar || permisos.archivar || permisos.papelera || permisos.verPapelera;

  return (
    <>
      <p className="meta" style={{ margin: '0 0 8px' }}>
        <Link to="/"><Icono nombre="atras" tam={14} /> Proyectos</Link>
      </p>

      {p.status === 'archived' && (
        <p className="aviso ambar" style={{ marginTop: 0, marginBottom: 12 }}>
          Proyecto archivado{p.archivedAt ? ` el ${fecha(p.archivedAt)}` : ''}. Se puede leer, pero no cambiar.
        </p>
      )}
      {p.status === 'trashed' && (
        <p className="aviso ambar" style={{ marginTop: 0, marginBottom: 12 }}>
          Este proyecto está en la papelera. Restáuralo para volver a usarlo.
        </p>
      )}

      <div className="cabecera-proyecto">
        <div className="fila" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <h2>{p.name}</h2>
            {p.description && <p className="descripcion">{p.description}</p>}
          </div>
          {hayAcciones && (
            <div className="menu-acciones">
              <button type="button" className="btn btn-sec btn-chico" aria-label="Acciones del proyecto" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
                <Icono nombre="puntos" tam={16} />
              </button>
              {menu && (
                <div className="usuario-menu" role="menu">
                  {permisos.editar && (
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); setEditando(true); }}>
                      <Icono nombre="editar" tam={16} />Editar nombre y descripción
                    </button>
                  )}
                  {permisos.archivar && p.status === 'active' && (
                    <button type="button" role="menuitem" onClick={() => transicion('archivar', `¿Archivar «${p.name}»? Queda de solo lectura.`)}>
                      <Icono nombre="archivar" tam={16} />Archivar
                    </button>
                  )}
                  {permisos.archivar && p.status === 'archived' && (
                    <button type="button" role="menuitem" onClick={() => transicion('reactivar')}>
                      <Icono nombre="archivar" tam={16} />Reactivar
                    </button>
                  )}
                  {permisos.verPapelera && p.status !== 'trashed' && (
                    <button type="button" role="menuitem" onClick={() => navegar(`/proyectos/${p.id}/papelera`)}>
                      <Icono nombre="papelera" tam={16} />Ver lo borrado
                    </button>
                  )}
                  {permisos.papelera && p.status !== 'trashed' && (
                    <button type="button" role="menuitem" onClick={() => transicion('papelera', `¿Mandar «${p.name}» a la papelera? Deja de verse para todos.`)}>
                      <Icono nombre="papelera" tam={16} />Mandar a la papelera
                    </button>
                  )}
                  {permisos.papelera && p.status === 'trashed' && (
                    <button type="button" role="menuitem" onClick={() => transicion('restaurar')}>
                      <Icono nombre="papelera" tam={16} />Restaurar
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="fila-personas">
          <div className="pila-avatares" aria-hidden="true">
            {d.personas.slice(0, 6).map((x) => (
              <span key={x.userId} className={`avatar${x.role === 'client' ? ' gris' : ''}`} title={x.name}>{iniciales(x.name)}</span>
            ))}
          </div>
          <button type="button" className="btn-texto" onClick={() => setViendoPersonas(true)}>
            {d.personas.length} {d.personas.length === 1 ? 'persona' : 'personas'}
            {permisos.personas ? ' · gestionar' : ''}
          </button>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {d.vistaCliente && <VistaCliente v={d.vistaCliente} hayClientes={d.personas.some((x) => x.role === 'client')} />}

      <div className={`secciones${d.secciones.ficha > 0 ? ' cuatro' : ''}`}>
        {SECCIONES.filter((s) => s.clave !== 'ficha' || d.secciones.ficha > 0).map((s) => {
          const n = d.secciones[s.clave];
          const interior = (
            <>
              <div className="seccion-cab">
                <Icono nombre={s.icono} />
                {s.nombre}
                {n > 0 && <span className="cuenta">{n} {n === 1 ? s.uno : s.varios}</span>}
              </div>
              {n === 0 ? <div className="vacia">{s.vacia}</div> : <Previa clave={s.clave} v={d.vistaPrevia} />}
            </>
          );
          return s.ruta ? (
            <Link key={s.clave} to={`/proyectos/${p.id}/${s.ruta}`} className="seccion seccion-enlace" aria-label={s.nombre}>{interior}</Link>
          ) : (
            <section key={s.clave} className="seccion" aria-label={s.nombre}>{interior}</section>
          );
        })}
      </div>

      {recientes && recientes.length > 0 && (
        <section className="card" style={{ marginTop: 16 }} aria-label="Actividad reciente">
          <div className="fila">
            <h3 className="titulo-panel">Actividad reciente</h3>
            <Link to={`/proyectos/${p.id}/actividad`} className="meta">Ver toda</Link>
          </div>
          <ListaActividad eventos={recientes} projectId={p.id} />
        </section>
      )}

      {editando && (
        <EditarProyecto
          id={p.id}
          nombre={p.name}
          descripcion={p.description ?? ''}
          onCerrar={() => setEditando(false)}
          onGuardado={() => {
            setEditando(false);
            cargar();
          }}
        />
      )}
      {viendoPersonas && (
        <PersonasDelProyecto
          detalle={d}
          verCorreos={!esCliente(yo.rol)}
          cuenta={yo.cuenta.name}
          onCerrar={() => setViendoPersonas(false)}
          onCambio={cargar}
        />
      )}
    </>
  );
}

function EditarProyecto(props: { id: string; nombre: string; descripcion: string; onCerrar: () => void; onGuardado: () => void }) {
  const [name, setName] = useState(props.nombre);
  const [description, setDescription] = useState(props.descripcion);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/proyectos/${props.id}`, { method: 'PATCH', body: { name, description } });
      props.onGuardado();
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo conectar.');
    }
  }

  return (
    <Modal titulo="Editar proyecto" onCerrar={props.onCerrar}>
      <form onSubmit={guardar}>
        <label htmlFor="e-nombre">Nombre</label>
        <input id="e-nombre" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="e-desc">Descripción</label>
        <textarea id="e-desc" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        {error && <p className="error" role="alert">{error}</p>}
        <div className="acciones" style={{ justifyContent: 'flex-end', marginBottom: 0 }}>
          <button type="button" className="btn btn-sec" onClick={props.onCerrar}>Cancelar</button>
          <button className="btn">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Personas del proyecto. Quien puede gestionarlas suma a gente de la cuenta, la quita, o invita
 * a un cliente nuevo directo a este proyecto (enlace para compartir).
 */
function PersonasDelProyecto(props: { detalle: ProyectoDetalle; verCorreos: boolean; cuenta: string; onCerrar: () => void; onCambio: () => void }) {
  const { proyecto, permisos } = props.detalle;
  const [personas, setPersonas] = useState(props.detalle.personas);
  const [deLaCuenta, setDeLaCuenta] = useState<DatosPersonas['personas']>([]);
  const [elegido, setElegido] = useState('');
  const [correoCliente, setCorreoCliente] = useState('');
  const [enlace, setEnlace] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const gestiona = permisos.personas;

  useEffect(() => {
    if (!gestiona) return;
    api<DatosPersonas>('/personas')
      .then((r) => setDeLaCuenta(r.personas.filter((x) => x.status === 'active')))
      .catch(() => {});
  }, [gestiona]);

  const fuera = deLaCuenta.filter((x) => !personas.some((p) => p.userId === x.userId));

  async function sumar() {
    if (!elegido) return;
    setError(null);
    try {
      setPersonas((await api<{ personas: typeof personas }>(`/proyectos/${proyecto.id}/personas`, { body: { userId: elegido } })).personas);
      setElegido('');
      olvidarMencionables(proyecto.id);
      props.onCambio();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar.');
    }
  }

  async function quitar(userId: string, nombre: string) {
    if (!window.confirm(`¿Quitar a ${nombre} del proyecto? Sigue en la cuenta.`)) return;
    try {
      setPersonas((await api<{ personas: typeof personas }>(`/proyectos/${proyecto.id}/personas/${userId}`, { method: 'DELETE' })).personas);
      olvidarMencionables(proyecto.id);
      props.onCambio();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar.');
    }
  }

  async function invitarCliente(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<InvitacionCreada>('/invitaciones', { body: { email: correoCliente, role: 'client', projectId: proyecto.id } });
      setEnlace(r.enlace);
      setCorreoCliente('');
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo conectar.');
    }
  }

  if (enlace) {
    return (
      <Modal titulo="Invitación lista" onCerrar={props.onCerrar}>
        <p className="meta">Al abrir el enlace, el cliente crea su contraseña y entra directo a <b>{proyecto.name}</b>. Solo verá lo marcado como visible para clientes.</p>
        <EnlaceCompartir enlace={enlace} mensaje={mensajeInvitacion(props.cuenta, enlace, proyecto.name)} />
        <button type="button" className="btn btn-sec btn-bloque" onClick={() => setEnlace(null)}>Volver a las personas</button>
      </Modal>
    );
  }

  return (
    <Modal titulo={`Personas en ${proyecto.name}`} onCerrar={props.onCerrar}>
      <ul className="lista-personas">
        {personas.map((x) => (
          <li key={x.userId}>
            <span className={`avatar${x.role === 'client' ? ' gris' : ''}`}>{iniciales(x.name)}</span>
            <span className="datos">
              <div className="nombre">{x.name}{x.company && <span className="meta"> · {x.company}</span>}</div>
              <div className="meta">{NOMBRE_ROL[x.role]}{props.verCorreos && x.email ? ` · ${x.email}` : ''}</div>
            </span>
            {gestiona && (
              <button type="button" className="btn-texto peligro" onClick={() => quitar(x.userId, x.name)}>Quitar</button>
            )}
          </li>
        ))}
      </ul>
      {!gestiona && <p className="ayuda">Dueños y administradores ven todos los proyectos aunque no estén en esta lista.</p>}

      {gestiona && (
        <>
          <label htmlFor="sumar-persona">Sumar a alguien de {props.cuenta}</label>
          <div className="sumar">
            <select id="sumar-persona" value={elegido} onChange={(e) => setElegido(e.target.value)}>
              <option value="">{fuera.length ? 'Elige una persona' : 'Todos ya están en el proyecto'}</option>
              {fuera.map((x) => (
                <option key={x.userId} value={x.userId}>{x.name} · {NOMBRE_ROL[x.role]}</option>
              ))}
            </select>
            <button type="button" className="btn" disabled={!elegido} onClick={sumar}>Sumar</button>
          </div>

          <form onSubmit={invitarCliente}>
            <label htmlFor="invitar-cliente">Invitar a un cliente nuevo</label>
            <div className="sumar">
              <input id="invitar-cliente" type="email" required placeholder="cliente@empresa.com" value={correoCliente} onChange={(e) => setCorreoCliente(e.target.value)} />
              <button className="btn btn-sec">Crear enlace</button>
            </div>
            <p className="ayuda">Entra como cliente solo a este proyecto. Para sumar al equipo, invítalo desde Personas.</p>
          </form>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </Modal>
  );
}

/** Para el equipo: qué ve el cliente en este proyecto, de un vistazo. */
function VistaCliente({ v, hayClientes }: { v: NonNullable<ProyectoDetalle['vistaCliente']>; hayClientes: boolean }) {
  const partes = [
    v.listas && `${v.listas} ${v.listas === 1 ? 'lista' : 'listas'}`,
    v.mensajes && `${v.mensajes} ${v.mensajes === 1 ? 'mensaje' : 'mensajes'}`,
    v.carpetas && `${v.carpetas} ${v.carpetas === 1 ? 'carpeta' : 'carpetas'}`,
    v.archivos && `${v.archivos} ${v.archivos === 1 ? 'archivo' : 'archivos'}`,
  ].filter(Boolean);
  return (
    <p className="aviso vista-cliente">
      <Icono nombre="ojo" tam={15} />
      <span>
        {!hayClientes
          ? 'Todavía no hay clientes en este proyecto. Lo que marques "visible para el cliente" lo verán cuando los invites.'
          : partes.length
            ? `El cliente ve: ${partes.join(' · ')}. Todo lo demás es interno.`
            : 'El cliente todavía no ve nada de este proyecto: todo es interno.'}
      </span>
    </p>
  );
}

const diaCorto = (dia: string) => {
  const [a, m, x] = dia.split('-').map(Number);
  return new Date(a, m - 1, x).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
};
const hace = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
const IMAGENES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const extension = (nombre: string) => (nombre.includes('.') ? nombre.split('.').pop()!.slice(0, 4).toUpperCase() : 'ARCH');

/** Miniatura si es una imagen; si no (o si no carga), la extensión. */
function PreviaArchivo({ a }: { a: VistaPrevia['archivos'][number] }) {
  const [fallo, setFallo] = useState(false);
  const imagen = !fallo && a.blobId && a.tipo && IMAGENES.includes(a.tipo);
  return (
    <div className="previa-archivo" title={a.title}>
      {imagen ? (
        <img src={urlArchivo(a.blobId!)} alt="" loading="lazy" onError={() => setFallo(true)} />
      ) : (
        <span className="previa-ext">{a.tipo === 'application/pdf' ? 'PDF' : extension(a.title)}</span>
      )}
      <span className="previa-nombre">{a.title}</span>
    </div>
  );
}

/** Lo que se ve dentro de cada tarjeta (sin enlaces adentro: la tarjeta entera es el enlace). */
function Previa({ clave, v }: { clave: string; v: VistaPrevia }) {
  if (clave === 'tareas') {
    return (
      <div className="previa">
        {v.tareas.listas.map((l) => (
          <div key={l.id} className="previa-lista">
            <div className="previa-lista-cab">
              <span className="previa-titulo">{l.title}</span>
              <span className="meta">{l.hechas}/{l.total}</span>
            </div>
            {l.tareas.length ? (
              <ul className="previa-tareas">
                {l.tareas.map((t) => (
                  <li key={t.id}>
                    <span className="casilla-previa" aria-hidden="true" />
                    <span className="previa-texto">{t.title}</span>
                    {t.dueOn && <span className="meta">{diaCorto(t.dueOn)}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta previa-nada">Todo completado</p>
            )}
          </div>
        ))}
        {v.tareas.pendientes > v.tareas.listas.reduce((n, l) => n + l.tareas.length, 0) && <p className="meta previa-mas">{v.tareas.pendientes} pendientes en total</p>}
      </div>
    );
  }
  if (clave === 'mensajes') {
    return (
      <ul className="previa previa-mensajes">
        {v.mensajes.map((m) => (
          <li key={m.id}>
            <span className="previa-titulo">{m.title}</span>
            <span className="meta">{m.autor.split(' ')[0]} · {hace(m.createdAt)}{m.extracto ? ` · ${m.extracto}` : ''}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (clave === 'archivos') {
    if (!v.archivos.length) return <p className="meta previa-nada">Solo carpetas por ahora</p>;
    return (
      <div className="previa previa-archivos">
        {v.archivos.map((a) => (
          <PreviaArchivo key={a.id} a={a} />
        ))}
      </div>
    );
  }
  if (clave === 'ficha') {
    const { respondidos, total } = v.ficha;
    return (
      <div className="previa previa-ficha">
        <span className="previa-cifra">{respondidos}<span className="meta"> de {total}</span></span>
        <span className="meta">datos respondidos</span>
        <div className="progreso" aria-hidden="true"><i style={{ width: `${total ? (respondidos / total) * 100 : 0}%` }} /></div>
      </div>
    );
  }
  return null;
}
