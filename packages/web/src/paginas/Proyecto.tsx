import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { NOMBRE_ROL, esCliente } from '@lucuma-pm/shared';
import { api, ErrorApi, type InvitacionCreada, type Personas as DatosPersonas, type ProyectoDetalle } from '../api';
import EnlaceCompartir, { mensajeInvitacion } from '../componentes/EnlaceCompartir';
import Icono, { type NombreIcono } from '../componentes/Icono';
import { iniciales } from '../componentes/Marca';
import Modal from '../componentes/Modal';
import { useYo } from '../contexto';

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long' });

const SECCIONES: { clave: keyof ProyectoDetalle['secciones']; nombre: string; icono: NombreIcono; vacia: string; uno: string; varios: string }[] = [
  { clave: 'tareas', nombre: 'Tareas', icono: 'tareas', vacia: 'Las listas de tareas del proyecto aparecerán aquí.', uno: 'lista', varios: 'listas' },
  { clave: 'mensajes', nombre: 'Mensajes', icono: 'mensajes', vacia: 'Anuncios y temas para conversar con el equipo y el cliente.', uno: 'mensaje', varios: 'mensajes' },
  { clave: 'archivos', nombre: 'Archivos', icono: 'archivo', vacia: 'Entregables, briefs y documentos, con sus versiones.', uno: 'elemento', varios: 'elementos' },
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

  const cargar = useCallback(() => {
    api<ProyectoDetalle>(`/proyectos/${id}`)
      .then(setD)
      .catch((e) => {
        if (e instanceof ErrorApi && e.status === 404) setNoExiste(true);
        else setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar.');
      });
  }, [id]);
  useEffect(cargar, [cargar]);

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
  const hayAcciones = permisos.editar || permisos.archivar || permisos.papelera;

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

      <div className="secciones">
        {SECCIONES.map((s) => {
          const n = d.secciones[s.clave];
          return (
            <section key={s.clave} className="seccion" aria-label={s.nombre}>
              <div className="seccion-cab">
                <Icono nombre={s.icono} />
                {s.nombre}
                {n > 0 && <span className="cuenta">{n} {n === 1 ? s.uno : s.varios}</span>}
              </div>
              <div className="vacia">{n === 0 ? s.vacia : 'Muy pronto vas a poder abrir esta sección.'}</div>
            </section>
          );
        })}
      </div>

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
      props.onCambio();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar.');
    }
  }

  async function quitar(userId: string, nombre: string) {
    if (!window.confirm(`¿Quitar a ${nombre} del proyecto? Sigue en la cuenta.`)) return;
    try {
      setPersonas((await api<{ personas: typeof personas }>(`/proyectos/${proyecto.id}/personas/${userId}`, { method: 'DELETE' })).personas);
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
