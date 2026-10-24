import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ErrorApi, type Sesion } from '../api';
import { NOMBRE_ROL, type Rol } from '@lucuma-pm/shared';
import { useConfig } from '../contexto';
import { irACuenta } from '../cuenta';

/** Selector: a qué cuenta entrar. */
export default function Cuentas() {
  const config = useConfig();
  const navegar = useNavigate();
  const [sesion, setSesion] = useState<Sesion | null>(null);

  useEffect(() => {
    api<Sesion>('/auth/sesion')
      .then(setSesion)
      .catch((e) => e instanceof ErrorApi && e.status === 401 && navegar('/entrar'));
  }, [navegar]);

  async function salir() {
    await api('/auth/salir', { body: {} });
    navegar('/entrar');
  }

  if (!sesion) return null;
  return (
    <div className="centro">
      <div className="tarjeta">
        <h1>Hola, {sesion.usuario.name}</h1>
        {sesion.cuentas.length === 0 ? (
          <p className="suave">Todavía no tienes acceso a ninguna cuenta. Pide a quien te invitó que te agregue.</p>
        ) : (
          <>
            <p className="suave">Elige a qué cuenta entrar.</p>
            <ul className="lista">
              {sesion.cuentas.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => irACuenta(config, c.slug)}>
                    <span>{c.name}</span>
                    <span className="suave">{NOMBRE_ROL[c.role as Rol] ?? c.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mensaje"><button type="button" className="enlace" onClick={salir}>Salir</button></p>
      </div>
    </div>
  );
}
