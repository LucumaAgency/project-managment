import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { NOMBRE_ROL, type RolAsignable } from '@lucuma-pm/shared';
import { api, ErrorApi, type InvitacionCreada, type InvitacionPendiente, type Persona, type Personas as DatosPersonas } from '../api';
import EnlaceCompartir, { mensajeInvitacion } from '../componentes/EnlaceCompartir';
import Icono from '../componentes/Icono';
import { iniciales } from '../componentes/Marca';
import Modal from '../componentes/Modal';
import { useYo } from '../contexto';

const DESCRIPCION_ROL: Record<RolAsignable, string> = {
  admin: 'Gestiona personas y ve todos los proyectos.',
  member: 'Equipo: trabaja en los proyectos donde está.',
  client: 'Externo: solo ve lo marcado como visible para clientes.',
};

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });

/**
 * Personas de la cuenta e invitaciones pendientes. Owner y admin invitan, cambian roles y
 * desactivan. Sin correo en el MVP: invitar genera un enlace para compartir a mano.
 */
export default function Personas() {
  const yo = useYo();
  const [datos, setDatos] = useState<DatosPersonas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invitando, setInvitando] = useState(false);
  const [enlace, setEnlace] = useState<{ email: string; enlace: string } | null>(null);

  const cargar = useCallback(() => {
    api<DatosPersonas>('/personas')
      .then(setDatos)
      .catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar.'));
  }, []);
  useEffect(cargar, [cargar]);

  async function cambiar(p: Persona, cambio: Partial<Pick<Persona, 'role' | 'status'>>) {
    setError(null);
    try {
      await api(`/personas/${p.id}`, { method: 'PATCH', body: cambio });
      cargar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar.');
    }
  }

  async function renovar(i: InvitacionPendiente) {
    try {
      const r = await api<InvitacionCreada>(`/invitaciones/${i.id}/renovar`, { body: {} });
      setEnlace({ email: i.email, enlace: r.enlace });
      cargar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar.');
    }
  }

  async function anular(i: InvitacionPendiente) {
    if (!window.confirm(`¿Anular la invitación a ${i.email}? El enlace dejará de servir.`)) return;
    try {
      await api(`/invitaciones/${i.id}`, { method: 'DELETE' });
      cargar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar.');
    }
  }

  if (!datos) return error ? <p className="error">{error}</p> : <p className="cargando">Cargando…</p>;
  const { gestionar } = datos.permisos;
  // El equipo invita clientes, pero siempre a un proyecto: eso se hace desde el proyecto (día 5).
  const puedeInvitarAqui = gestionar && datos.permisos.invitar.length > 0;
  const { maxUsuarios, usuariosEnUso } = datos.plan;
  const activos = datos.personas.filter((p) => p.status === 'active').length;

  return (
    <>
      <div className="herramientas">
        <div className="empuja">
          <h2>{activos} {activos === 1 ? 'persona' : 'personas'}</h2>
          <div className="meta">
            {maxUsuarios === null
              ? `Plan ${datos.plan.nombre}: equipo sin límite. Los clientes no cuentan.`
              : `Plan ${datos.plan.nombre}: ${usuariosEnUso} de ${maxUsuarios} del equipo (con invitaciones pendientes). Los clientes no cuentan.`}
          </div>
        </div>
        {puedeInvitarAqui && (
          <button type="button" className="btn" onClick={() => setInvitando(true)}>
            <Icono nombre="mas" tam={16} />Invitar
          </button>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <div className="tabla-marco">
        <table className="tabla tabla-movil">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Rol</th>
              <th className="solo-escritorio">Último acceso</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {datos.personas.map((p) => {
              const editable = gestionar && !p.esYo && p.role !== 'owner';
              const inactiva = p.status === 'disabled';
              return (
                <tr key={p.id} className={inactiva ? 'inactiva' : ''}>
                  <td className="t-principal">
                    <div className="celda-nombre">
                      <span className={`avatar${inactiva ? ' gris' : ''}`}>{iniciales(p.name)}</span>
                      <span className="datos">
                        <div className="nombre">
                          {p.name}
                          {p.esYo && <span className="meta"> (tú)</span>}
                          {p.company && <span className="meta"> · {p.company}</span>}
                        </div>
                        <div className="meta">{p.esBot ? 'Bot (integración por API)' : p.email}</div>
                      </span>
                    </div>
                  </td>
                  <td>
                    {editable && !inactiva ? (
                      <select
                        aria-label={`Rol de ${p.name}`}
                        value={p.role}
                        onChange={(e) => cambiar(p, { role: e.target.value as RolAsignable })}
                      >
                        {datos.permisos.invitar.map((r) => (
                          <option key={r} value={r}>{NOMBRE_ROL[r]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`chip${p.role === 'client' ? ' chip-gris' : ''}`}>{NOMBRE_ROL[p.role]}</span>
                    )}
                    {inactiva && <span className="chip chip-rojo" style={{ marginLeft: 6 }}>Desactivada</span>}
                  </td>
                  <td className="solo-escritorio meta">{p.lastLoginAt ? fecha(p.lastLoginAt) : 'Nunca'}</td>
                  <td className="t-accion">
                    {editable &&
                      (inactiva ? (
                        <button type="button" className="btn-texto" onClick={() => cambiar(p, { status: 'active' })}>Reactivar</button>
                      ) : (
                        <button
                          type="button"
                          className="btn-texto peligro"
                          onClick={() => window.confirm(`¿Desactivar a ${p.name}? Deja de entrar a ${yo.cuenta.name} de inmediato.`) && cambiar(p, { status: 'disabled' })}
                        >
                          Desactivar
                        </button>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {datos.invitaciones.length > 0 && (
        <>
          <div className="herramientas"><h2>Invitaciones pendientes</h2></div>
          <div className="tabla-marco">
            <table className="tabla tabla-movil">
              <tbody>
                {datos.invitaciones.map((i) => (
                  <tr key={i.id}>
                    <td className="t-principal">
                      <div className="celda-nombre">
                        <span className="avatar gris"><Icono nombre="enlace" tam={14} /></span>
                        <span className="datos">
                          <div className="nombre">{i.email}</div>
                          <div className="meta">Invitada el {fecha(i.createdAt)}</div>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="chip chip-gris">{NOMBRE_ROL[i.role]}</span>{' '}
                      {i.vencida ? <span className="chip chip-alerta">Vencida</span> : <span className="meta">Vence el {fecha(i.expiresAt)}</span>}
                    </td>
                    <td className="t-accion">
                      <button type="button" className="btn-texto" onClick={() => renovar(i)}>Nuevo enlace</button>
                      <button type="button" className="btn-texto peligro" onClick={() => anular(i)}>Anular</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ayuda">Por seguridad el enlace no se guarda: "Nuevo enlace" genera otro y el anterior deja de servir.</p>
        </>
      )}

      {invitando && (
        <Invitar
          roles={datos.permisos.invitar}
          onCerrar={() => setInvitando(false)}
          onListo={(r) => {
            setInvitando(false);
            setEnlace({ email: r.invitacion.email, enlace: r.enlace });
            cargar();
          }}
        />
      )}
      {enlace && (
        <Modal titulo="Invitación lista" onCerrar={() => setEnlace(null)}>
          <p className="meta">Envíale este enlace a <b>{enlace.email}</b>. Al abrirlo crea su contraseña y entra a {yo.cuenta.name}.</p>
          <EnlaceCompartir enlace={enlace.enlace} mensaje={mensajeInvitacion(yo.cuenta.name, enlace.enlace)} />
        </Modal>
      )}
    </>
  );
}

function Invitar({ roles, onCerrar, onListo }: { roles: RolAsignable[]; onCerrar: () => void; onListo: (r: InvitacionCreada) => void }) {
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<RolAsignable>(roles.includes('member') ? 'member' : roles[0]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      onListo(await api<InvitacionCreada>('/invitaciones', { body: { email, role: rol } }));
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo conectar.');
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Invitar a la cuenta" onCerrar={onCerrar}>
      <form onSubmit={enviar}>
        <label htmlFor="inv-email">Correo</label>
        <input id="inv-email" type="email" required autoFocus placeholder="persona@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="inv-rol">Rol</label>
        <select id="inv-rol" value={rol} onChange={(e) => setRol(e.target.value as RolAsignable)}>
          {roles.map((r) => (
            <option key={r} value={r}>{NOMBRE_ROL[r]}</option>
          ))}
        </select>
        <p className="ayuda">{DESCRIPCION_ROL[rol]}</p>
        <p className="aviso">Todavía no enviamos correos: al crear la invitación te damos un enlace para que se lo pases tú.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="acciones" style={{ justifyContent: 'flex-end', marginBottom: 0 }}>
          <button type="button" className="btn btn-sec" onClick={onCerrar}>Cancelar</button>
          <button className="btn" disabled={enviando}>{enviando ? 'Creando…' : 'Crear enlace'}</button>
        </div>
      </form>
    </Modal>
  );
}
