import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ErrorApi, type Sesion } from '../api';

/** Datos propios: por ahora, definir o cambiar la contraseña. */
export default function MiCuenta() {
  const navegar = useNavigate();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    api<Sesion>('/auth/sesion').then(setSesion).catch(() => navegar('/entrar'));
  }, [navegar]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    try {
      await api('/auth/password', { body: { actual: actual || undefined, nueva } });
      setMensaje({ tipo: 'ok', texto: 'Contraseña guardada. Se cerraron tus otras sesiones.' });
      setActual('');
      setNueva('');
      setSesion((s) => (s ? { ...s, usuario: { ...s.usuario, tienePassword: true } } : s));
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ErrorApi ? err.message : 'No se pudo conectar.' });
    }
  }

  if (!sesion) return null;
  const tiene = sesion.usuario.tienePassword;
  return (
    <div className="centro">
      <form className="tarjeta" onSubmit={guardar}>
        <h1>Mi cuenta</h1>
        <p className="suave">{sesion.usuario.name} · {sesion.usuario.email}</p>
        {tiene && (
          <>
            <label htmlFor="actual">Contraseña actual</label>
            <input id="actual" type="password" autoComplete="current-password" required value={actual} onChange={(e) => setActual(e.target.value)} />
          </>
        )}
        <label htmlFor="nueva">{tiene ? 'Contraseña nueva' : 'Define una contraseña'}</label>
        <input id="nueva" type="password" autoComplete="new-password" minLength={10} required value={nueva} onChange={(e) => setNueva(e.target.value)} />
        <p className="suave">Mínimo 10 caracteres. También puedes seguir entrando con el enlace al correo.</p>
        <button className="primario">Guardar</button>
        {mensaje && <p className={`mensaje ${mensaje.tipo}`} role="status">{mensaje.texto}</p>}
        <p className="mensaje"><Link to="/">Volver</Link></p>
      </form>
    </div>
  );
}
