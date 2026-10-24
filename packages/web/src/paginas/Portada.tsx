import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { NOMBRE_ROL, type Rol } from '@lucuma-pm/shared';
import { api, ErrorApi, olvidarCuentaLocal, type Sesion, type Yo } from '../api';
import { useConfig } from '../contexto';
import { cuentaActual, irACuenta, irARaiz } from '../cuenta';

/**
 * "/": dentro de una cuenta muestra la portada; en la raíz decide a dónde ir.
 * Los proyectos llegan el día 5; por ahora confirma quién eres y en qué cuenta estás.
 */
export default function Portada() {
  const config = useConfig();
  const navegar = useNavigate();
  const slug = cuentaActual(config);
  const [yo, setYo] = useState<Yo | null>(null);
  const [problema, setProblema] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      api<Sesion>('/auth/sesion')
        .then((s) => (s.cuentas.length === 1 ? irACuenta(config, s.cuentas[0].slug) : navegar('/cuentas')))
        .catch(() => navegar('/entrar'));
      return;
    }
    api<Yo>('/yo')
      .then(setYo)
      .catch((e) => {
        if (e instanceof ErrorApi && e.status === 401) return navegar('/entrar');
        setProblema(e instanceof ErrorApi ? e.message : 'No se pudo conectar.');
      });
  }, [slug, config, navegar]);

  async function salir() {
    await api('/auth/salir', { body: {} });
    olvidarCuentaLocal();
    irARaiz(config, '/entrar');
  }

  if (problema) {
    return (
      <div className="centro">
        <div className="tarjeta">
          <h1>No se puede abrir esta cuenta</h1>
          <p className="mensaje error">{problema}</p>
          <p className="mensaje">
            <button type="button" className="enlace" onClick={() => { olvidarCuentaLocal(); irARaiz(config); }}>Ver mis cuentas</button>
          </p>
        </div>
      </div>
    );
  }
  if (!yo) return null;
  return (
    <>
      <header className="barra">
        <strong>{yo.cuenta.name}</strong>
        <nav className="acciones">
          <button type="button" className="enlace" onClick={() => { olvidarCuentaLocal(); irARaiz(config); }}>Cambiar de cuenta</button>
          <Link to="/mi-cuenta">Mi cuenta</Link>
          <button type="button" className="enlace" onClick={salir}>Salir</button>
        </nav>
      </header>
      <main className="contenido">
        <h1>Hola, {yo.usuario.name}</h1>
        <p className="suave">Estás en {yo.cuenta.name} como {NOMBRE_ROL[yo.rol as Rol] ?? yo.rol}. Aquí aparecerán tus proyectos.</p>
      </main>
    </>
  );
}
