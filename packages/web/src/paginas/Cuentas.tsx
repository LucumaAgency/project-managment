import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NOMBRE_ROL, PLANES, type Rol } from '@lucuma-pm/shared';
import { api, ErrorApi, type Sesion } from '../api';
import { iniciales } from '../componentes/Marca';
import PaginaAcceso from '../componentes/PaginaAcceso';
import { useConfig } from '../contexto';
import { irACuenta } from '../cuenta';

interface CuentaSoporte {
  id: string;
  slug: string;
  name: string;
  plan: string;
}

/** Selector: a qué cuenta entrar. Soporte de Lucuma ve además todas las demás (beta). */
export default function Cuentas() {
  const config = useConfig();
  const navegar = useNavigate();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [deSoporte, setDeSoporte] = useState<CuentaSoporte[]>([]);

  useEffect(() => {
    api<Sesion>('/auth/sesion')
      .then((s) => {
        setSesion(s);
        if (s.usuario.soporte) {
          api<{ cuentas: CuentaSoporte[] }>('/soporte/cuentas')
            .then((r) => setDeSoporte(r.cuentas.filter((c) => !s.cuentas.some((m) => m.id === c.id))))
            .catch(() => {}); // fuera de la beta: 403, no se muestran
        }
      })
      .catch((e) => e instanceof ErrorApi && e.status === 401 && navegar('/entrar', { replace: true }));
  }, [navegar]);

  async function salir() {
    await api('/auth/salir', { body: {} });
    navegar('/entrar');
  }

  if (!sesion) return null;
  const fila = (c: { id: string; slug: string; name: string }, detalle: string) => (
    <li key={c.id}>
      <button type="button" onClick={() => irACuenta(config, c.slug)}>
        <span className="ficha-icono">{iniciales(c.name)}</span>
        <span className="datos">
          <div className="nombre">{c.name}</div>
          <div className="meta">{detalle}</div>
        </span>
      </button>
    </li>
  );

  return (
    <PaginaAcceso
      titulo={`Hola, ${sesion.usuario.name}`}
      subtitulo={sesion.cuentas.length ? 'Elige a qué cuenta entrar.' : undefined}
    >
      {sesion.cuentas.length === 0 && deSoporte.length === 0 && (
        <p className="aviso">Todavía no tienes acceso a ninguna cuenta. Pide a quien te invitó que te envíe el enlace de invitación.</p>
      )}
      {sesion.cuentas.length > 0 && (
        <ul className="lista-cuentas">{sesion.cuentas.map((c) => fila(c, NOMBRE_ROL[c.role as Rol] ?? c.role))}</ul>
      )}
      {deSoporte.length > 0 && (
        <>
          <div className="nav-seccion" style={{ padding: '18px 0 0' }}>Como soporte de Lucuma</div>
          <ul className="lista-cuentas">{deSoporte.map((c) => fila(c, `Plan ${PLANES[c.plan]?.nombre ?? c.plan} · entras como administrador`))}</ul>
        </>
      )}
      <p className="meta pie">
        <button type="button" className="btn-texto" onClick={salir}>Cerrar sesión</button>
      </p>
    </PaginaAcceso>
  );
}
