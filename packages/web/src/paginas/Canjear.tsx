import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ErrorApi, type Sesion } from '../api';
import PaginaAcceso from '../componentes/PaginaAcceso';
import { despuesDeEntrar, useConfig } from '../contexto';

/** Destino del enlace del correo: canjea el token y sigue. */
export default function Canjear() {
  const config = useConfig();
  const navegar = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const hecho = useRef(false); // StrictMode monta dos veces: el token sirve una sola vez

  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) return setError('Al enlace le falta una parte. Pide uno nuevo.');
    api<Sesion>('/auth/canjear', { body: { token } })
      .then((sesion) => despuesDeEntrar(config, sesion, navegar))
      .catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar.'));
  }, [config, navegar]);

  return (
    <PaginaAcceso titulo={error ? 'No se pudo entrar' : 'Entrando…'}>
      {error && (
        <>
          <p className="error">{error}</p>
          <p className="meta pie"><Link to="/entrar">Volver a entrar</Link></p>
        </>
      )}
    </PaginaAcceso>
  );
}
