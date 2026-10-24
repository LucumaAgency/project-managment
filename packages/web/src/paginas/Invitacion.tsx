import { useEffect, useState, type FormEvent } from 'react';
import { MIN_LARGO_PASSWORD, NOMBRE_ROL } from '@lucuma-pm/shared';
import { api, ErrorApi, type InvitacionVista } from '../api';
import PaginaAcceso from '../componentes/PaginaAcceso';
import { useConfig } from '../contexto';
import { irACuenta } from '../cuenta';

/**
 * Destino del enlace de invitación. Tres caminos:
 *  - Correo sin usuario: crea su nombre y contraseña y entra.
 *  - Usuario con sesión de esa persona: un botón "Unirme".
 *  - Usuario sin sesión (o con la de otra persona): entra con SU contraseña y acepta.
 */
export default function Invitacion() {
  const config = useConfig();
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [inv, setInv] = useState<InvitacionVista | null>(null);
  const [problema, setProblema] = useState<string | null>(token ? null : 'Al enlace le falta una parte. Pide que te lo envíen de nuevo.');
  const [nombre, setNombre] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api<InvitacionVista>('/invitacion/ver', { body: { token } })
      .then(setInv)
      .catch((e) => setProblema(e instanceof ErrorApi ? e.message : 'No se pudo conectar.'));
  }, [token]);

  async function aceptar(e?: FormEvent) {
    e?.preventDefault();
    if (!inv) return;
    setEnviando(true);
    setError(null);
    try {
      if (inv.existeUsuario && !inv.sesion?.esLaInvitada) {
        // Primero entra como esa persona (su contraseña); después acepta con esa sesión.
        await api('/auth/entrar', { body: { email: inv.email, password } });
        await api('/invitacion/aceptar', { body: { token } });
      } else if (inv.existeUsuario) {
        await api('/invitacion/aceptar', { body: { token } });
      } else {
        await api('/invitacion/aceptar', { body: { token, nombre, password } });
      }
      irACuenta(config, inv.cuenta.slug);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo conectar.');
      setEnviando(false);
    }
  }

  if (problema) {
    return (
      <PaginaAcceso titulo="Invitación no válida">
        <p className="error">{problema}</p>
      </PaginaAcceso>
    );
  }
  if (!inv) return null;

  if (inv.estado !== 'vigente') {
    const texto = {
      usada: 'Esta invitación ya se usó. Si eras tú, entra con tu correo y contraseña.',
      vencida: 'Esta invitación venció. Pide a quien te invitó un enlace nuevo.',
      cerrada: 'Esta cuenta fue cerrada.',
    }[inv.estado];
    return (
      <PaginaAcceso titulo={`Invitación a ${inv.cuenta.name}`}>
        <p className="aviso ambar">{texto}</p>
        {inv.estado === 'usada' && <a className="btn btn-bloque" style={{ marginTop: 16 }} href="/entrar">Ir a entrar</a>}
      </PaginaAcceso>
    );
  }

  const detalle = (
    <>
      {inv.invitadoPor ? `${inv.invitadoPor} te invita` : 'Te invitan'} como <b>{NOMBRE_ROL[inv.role].toLowerCase()}</b>
      {inv.proyecto && <> al proyecto <b>{inv.proyecto}</b></>}.
    </>
  );

  return (
    <PaginaAcceso titulo={`Únete a ${inv.cuenta.name}`} subtitulo={detalle}>
      {inv.existeUsuario && inv.sesion?.esLaInvitada ? (
        <>
          <p className="meta">Entraste como {inv.email}.</p>
          <button type="button" className="btn btn-bloque" style={{ marginTop: 8 }} disabled={enviando} onClick={() => aceptar()}>
            {enviando ? 'Uniéndote…' : `Unirme a ${inv.cuenta.name}`}
          </button>
        </>
      ) : (
        <form onSubmit={aceptar}>
          <label htmlFor="inv-correo">Correo</label>
          <input id="inv-correo" type="email" readOnly value={inv.email} />
          {inv.existeUsuario ? (
            <>
              {inv.sesion && <p className="aviso ambar">Ahora estás como {inv.sesion.email}. Al continuar entras como {inv.email}.</p>}
              <label htmlFor="inv-password">Tu contraseña</label>
              <input id="inv-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <p className="ayuda">Ya tienes usuario con este correo (en otra cuenta). Entra con tu contraseña de siempre.</p>
            </>
          ) : (
            <>
              <label htmlFor="inv-nombre">Tu nombre</label>
              <input id="inv-nombre" autoComplete="name" required maxLength={100} value={nombre} onChange={(e) => setNombre(e.target.value)} />
              <label htmlFor="inv-nueva">Crea una contraseña</label>
              <input id="inv-nueva" type="password" autoComplete="new-password" required minLength={MIN_LARGO_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} />
              <p className="ayuda">Mínimo {MIN_LARGO_PASSWORD} caracteres. Con tu correo y esta contraseña entras después.</p>
            </>
          )}
          <button className="btn btn-bloque" style={{ marginTop: 16 }} disabled={enviando}>
            {enviando ? 'Un momento…' : inv.existeUsuario ? 'Entrar y unirme' : 'Crear mi acceso'}
          </button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </PaginaAcceso>
  );
}
