import { useEffect, useState, type FormEvent } from 'react';
import { NOMBRE_ROL } from '@lucuma-pm/shared';
import { api, ErrorApi, type InvitacionCreada, type Persona, type Personas, type PlantillaResumen, type Plantillas } from '../api';
import { useYo } from '../contexto';
import EnlaceCompartir, { mensajeInvitacion } from './EnlaceCompartir';
import Icono from './Icono';

const hoy = () => new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD en la hora local
const mensajeDe = (e: unknown) => (e instanceof ErrorApi ? e.message : 'No se pudo conectar.');
const fechaLarga = (dia: string) =>
  new Date(`${dia}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PASOS = ['Datos', 'Equipo', 'Cliente', 'Plantilla', 'Revisar'] as const;

interface Resultado {
  id: string;
  nombre: string;
  enlace: string | null;
  avisos: string[];
}

/**
 * Asistente para crear un proyecto (D-81): datos, equipo, cliente y plantilla en un solo
 * recorrido. No hay ruta nueva en la API: al final llama, en orden, a crear proyecto, sumar
 * personas, aplicar plantilla e invitar. Si algo falla después de crear, el proyecto queda y se
 * avisa qué faltó. El cliente va antes que la plantilla para que sus tareas le queden asignadas.
 */
export default function NuevoProyecto({ onCerrar, onListo }: { onCerrar: () => void; onListo: (id: string) => void }) {
  const yo = useYo();
  const [paso, setPaso] = useState(0);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [equipo, setEquipo] = useState<string[]>([]);
  const [clientes, setClientes] = useState<string[]>([]);
  const [correoCliente, setCorreoCliente] = useState('');
  const [plantillas, setPlantillas] = useState<PlantillaResumen[] | null>(null);
  const [plantilla, setPlantilla] = useState('');
  const [inicio, setInicio] = useState(hoy());
  const [responsable, setResponsable] = useState(yo.usuario.id);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    api<Personas>('/personas')
      .then((r) => setPersonas(r.personas.filter((p) => p.status === 'active' && !p.esBot)))
      .catch(() => setPersonas([]));
    api<Plantillas>('/plantillas')
      .then((r) => setPlantillas(r.plantillas))
      .catch(() => setPlantillas([]));
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && !creando && cerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  const delEquipo = (personas ?? []).filter((p) => p.role !== 'client' && p.userId !== yo.usuario.id);
  const deClientes = (personas ?? []).filter((p) => p.role === 'client');
  const elegida = plantillas?.find((p) => p.id === plantilla) ?? null;
  const responsables = (personas ?? []).filter((p) => p.role !== 'client' && (p.userId === yo.usuario.id || equipo.includes(p.userId)));
  const correo = correoCliente.trim().toLowerCase();
  const correoMalo = correo !== '' && !CORREO.test(correo);
  const correoRepetido = correo !== '' && (personas ?? []).some((p) => p.email.toLowerCase() === correo);

  const marcar = (lista: string[], fijar: (l: string[]) => void, id: string) =>
    fijar(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  function cerrar() {
    if (resultado) onListo(resultado.id);
    else onCerrar();
  }

  function siguiente(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    if (paso === 0 && !nombre.trim()) return setError('Escribe el nombre del proyecto.');
    if (paso === 2 && correoMalo) return setError('Ese correo no es válido.');
    if (paso === 2 && correoRepetido) return setError('Esa persona ya está en la cuenta: márcala en la lista de arriba.');
    if (paso < PASOS.length - 1) setPaso(paso + 1);
    else void crear();
  }

  async function crear() {
    setCreando(true);
    setError(null);
    let id: string;
    try {
      const r = await api<{ proyecto: { id: string } }>('/proyectos', {
        body: { name: nombre.trim(), description: descripcion.trim() || undefined },
      });
      id = r.proyecto.id;
    } catch (e) {
      setError(mensajeDe(e));
      setCreando(false);
      return;
    }

    const avisos: string[] = [];
    const sumados: string[] = [];
    for (const userId of [...equipo, ...clientes]) {
      try {
        await api(`/proyectos/${id}/personas`, { body: { userId } });
        sumados.push(userId);
      } catch (e) {
        const quien = personas?.find((p) => p.userId === userId)?.name ?? 'una persona';
        avisos.push(`No se sumó a ${quien}: ${mensajeDe(e)}`);
      }
    }
    if (plantilla) {
      try {
        await api(`/proyectos/${id}/plantillas`, {
          body: {
            plantillaId: plantilla,
            inicio,
            responsableId: responsable && (responsable === yo.usuario.id || sumados.includes(responsable)) ? responsable : null,
            clienteIds: clientes.filter((c) => sumados.includes(c)),
          },
        });
      } catch (e) {
        avisos.push(`No se agregó la plantilla: ${mensajeDe(e)} Puedes agregarla desde Tareas.`);
      }
    }
    let enlace: string | null = null;
    if (correo) {
      try {
        enlace = (await api<InvitacionCreada>('/invitaciones', { body: { email: correo, role: 'client', projectId: id } })).enlace;
      } catch (e) {
        avisos.push(`No se creó la invitación: ${mensajeDe(e)} Puedes invitarlo desde Personas del proyecto.`);
      }
    }

    setCreando(false);
    if (!enlace && avisos.length === 0) return onListo(id);
    setResultado({ id, nombre: nombre.trim(), enlace, avisos });
  }

  const titulo = resultado ? 'Proyecto creado' : 'Nuevo proyecto';

  return (
    <div className="modal-fondo" onClick={() => !creando && cerrar()}>
      <div className="modal np-modal" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="modal-cab">
          <span className="pp-eyebrow">{resultado ? titulo : `${titulo} · ${paso + 1} de ${PASOS.length}`}</span>
          <button type="button" className="cerrar" aria-label="Cerrar" disabled={creando} onClick={cerrar}>×</button>
        </div>

        {resultado ? (
          <div className="pp-cuerpo">
            <div className="pp-titulo-paso">
              <span className="pp-num hecho"><Icono nombre="check" tam={16} /></span>
              <h2>{resultado.nombre} está listo</h2>
            </div>
            {resultado.avisos.map((a) => (
              <p key={a} className="aviso ambar">{a}</p>
            ))}
            {resultado.enlace && (
              <>
                <p className="meta">Pásale este enlace al cliente: crea su contraseña y entra directo al proyecto. Solo verá lo marcado como visible para clientes.</p>
                <EnlaceCompartir enlace={resultado.enlace} mensaje={mensajeInvitacion(yo.cuenta.name, resultado.enlace, resultado.nombre)} />
              </>
            )}
            <button type="button" className="btn btn-bloque" onClick={() => onListo(resultado.id)}>Ir al proyecto</button>
          </div>
        ) : (
          <form onSubmit={siguiente}>
            <div className="pp-puntos" aria-hidden="true">
              {PASOS.map((p, n) => (
                <button
                  key={p}
                  type="button"
                  tabIndex={-1}
                  className={`pp-punto${n === paso ? ' activo' : n < paso ? ' hecho' : ''}`}
                  onClick={() => n < paso && setPaso(n)}
                />
              ))}
            </div>

            <div className="pp-cuerpo">
              {paso === 0 && (
                <>
                  <h2>¿De qué es el proyecto?</h2>
                  <label htmlFor="np-nombre">Nombre</label>
                  <input id="np-nombre" autoFocus maxLength={120} placeholder="Ej.: Web de Proba 2027" value={nombre} onChange={(e) => { setNombre(e.target.value); setError(null); }} />
                  <label htmlFor="np-desc">Descripción (opcional)</label>
                  <textarea id="np-desc" rows={3} maxLength={1000} placeholder="De qué trata, para quién es" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
                </>
              )}

              {paso === 1 && (
                <>
                  <h2>¿Quién del equipo trabaja aquí?</h2>
                  <p className="meta">Tú entras siempre. Dueños y administradores ven todos los proyectos aunque no los marques.</p>
                  {!personas ? (
                    <p className="cargando">Cargando…</p>
                  ) : delEquipo.length === 0 ? (
                    <p className="ayuda">Por ahora eres el único del equipo. Puedes invitar a más gente desde Personas.</p>
                  ) : (
                    <div className="opciones-personas">
                      {delEquipo.map((p) => (
                        <label key={p.userId} className="casilla">
                          <input type="checkbox" checked={equipo.includes(p.userId)} onChange={() => marcar(equipo, setEquipo, p.userId)} />
                          <span>{p.name} <span className="meta">· {NOMBRE_ROL[p.role]}</span></span>
                        </label>
                      ))}
                    </div>
                  )}
                </>
              )}

              {paso === 2 && (
                <>
                  <h2>¿Y el cliente?</h2>
                  <p className="meta">Opcional. El cliente solo ve lo marcado como visible para clientes.</p>
                  {deClientes.length > 0 && (
                    <>
                      <label>Clientes que ya están en la cuenta</label>
                      <div className="opciones-personas">
                        {deClientes.map((p) => (
                          <label key={p.userId} className="casilla">
                            <input type="checkbox" checked={clientes.includes(p.userId)} onChange={() => marcar(clientes, setClientes, p.userId)} />
                            <span>{p.name}{p.company && <span className="meta"> · {p.company}</span>}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                  <label htmlFor="np-correo">{deClientes.length ? 'O invita a uno nuevo (correo)' : 'Invita al cliente (correo)'}</label>
                  <input id="np-correo" type="email" maxLength={200} placeholder="cliente@empresa.com" value={correoCliente} onChange={(e) => { setCorreoCliente(e.target.value); setError(null); }} />
                  <p className="ayuda">Al final te damos el enlace para pasárselo por WhatsApp. No se envía ningún correo.</p>
                </>
              )}

              {paso === 3 && (
                <>
                  <h2>¿Empiezas con una plantilla?</h2>
                  <p className="meta">Carga una lista de tareas ya armada. Puedes saltarlo y agregarla después desde Tareas.</p>
                  {!plantillas ? (
                    <p className="cargando">Cargando…</p>
                  ) : plantillas.length === 0 ? (
                    <p className="ayuda">Todavía no hay plantillas en la cuenta. Se crean en Plantillas.</p>
                  ) : (
                    <>
                      <label htmlFor="np-plantilla">Plantilla</label>
                      <select id="np-plantilla" value={plantilla} onChange={(e) => setPlantilla(e.target.value)}>
                        <option value="">Sin plantilla, empiezo vacío</option>
                        {plantillas.map((p) => (
                          <option key={p.id} value={p.id}>{p.name} ({p.tareas} tareas)</option>
                        ))}
                      </select>
                      {elegida && (
                        <>
                          <div className="rejilla-2">
                            <div>
                              <label htmlFor="np-inicio">Fecha de inicio (día 1)</label>
                              <input id="np-inicio" type="date" required value={inicio} onChange={(e) => setInicio(e.target.value)} />
                            </div>
                            <div>
                              <label htmlFor="np-resp">Tareas del equipo a cargo de</label>
                              <select id="np-resp" value={responsable} onChange={(e) => setResponsable(e.target.value)}>
                                {responsables.map((p) => (
                                  <option key={p.userId} value={p.userId}>{p.name}{p.userId === yo.usuario.id ? ' (tú)' : ''}</option>
                                ))}
                                <option value="">Sin asignar</option>
                              </select>
                            </div>
                          </div>
                          {elegida.delCliente > 0 && clientes.length === 0 && (
                            <p className="ayuda">
                              Tiene {elegida.delCliente} {elegida.delCliente === 1 ? 'tarea' : 'tareas'} del cliente: quedan visibles pero sin asignar
                              {correo ? ' hasta que el cliente invitado entre y se las asignes.' : '.'}
                            </p>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {paso === 4 && (
                <>
                  <h2>Revisa y crea</h2>
                  <ul className="pp-lista">
                    <Fila etiqueta="Proyecto" valor={nombre.trim()} ir={() => setPaso(0)} />
                    <Fila
                      etiqueta="Equipo"
                      valor={['Tú', ...delEquipo.filter((p) => equipo.includes(p.userId)).map((p) => p.name)].join(', ')}
                      ir={() => setPaso(1)}
                    />
                    <Fila
                      etiqueta="Cliente"
                      valor={
                        [...deClientes.filter((p) => clientes.includes(p.userId)).map((p) => p.name), ...(correo ? [`${correo} (invitación)`] : [])].join(', ') ||
                        'Ninguno por ahora'
                      }
                      ir={() => setPaso(2)}
                    />
                    <Fila etiqueta="Plantilla" valor={elegida ? `${elegida.name}, desde el ${fechaLarga(inicio)}` : 'Sin plantilla'} ir={() => setPaso(3)} />
                  </ul>
                </>
              )}
              {error && <p className="error" role="alert">{error}</p>}
            </div>

            <div className="pp-pie">
              <button type="button" className="btn btn-sec" disabled={creando} onClick={() => (paso === 0 ? onCerrar() : (setError(null), setPaso(paso - 1)))}>
                {paso === 0 ? 'Cancelar' : 'Anterior'}
              </button>
              <button className="btn" disabled={creando}>
                {paso < PASOS.length - 1 ? 'Siguiente' : creando ? 'Creando…' : 'Crear proyecto'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Fila({ etiqueta, valor, ir }: { etiqueta: string; valor: string; ir: () => void }) {
  return (
    <li>
      <span>
        <span className="meta">{etiqueta}</span>
        <br />
        {valor}
      </span>
      <button type="button" className="btn-texto" onClick={ir}>Cambiar</button>
    </li>
  );
}
