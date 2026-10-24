import { useEffect, useState, type FormEvent } from 'react';
import { MIN_LARGO_PASSWORD } from '@lucuma-pm/shared';
import { api, ErrorApi, type Sesion } from '../api';

/** Datos propios: por ahora, definir o cambiar la contraseña. */
export default function MiCuenta() {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    api<Sesion>('/auth/sesion').then(setSesion).catch(() => {});
  }, []);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    setGuardando(true);
    try {
      await api('/auth/password', { body: { actual: actual || undefined, nueva } });
      setMensaje({ tipo: 'ok', texto: 'Contraseña guardada. Se cerraron tus sesiones en otros dispositivos.' });
      setActual('');
      setNueva('');
      setSesion((s) => (s ? { ...s, usuario: { ...s.usuario, tienePassword: true } } : s));
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ErrorApi ? err.message : 'No se pudo conectar.' });
    } finally {
      setGuardando(false);
    }
  }

  if (!sesion) return <p className="cargando">Cargando…</p>;
  const tiene = sesion.usuario.tienePassword;
  return (
    <form className="card card-estrecha" onSubmit={guardar}>
      <h2 className="titulo-panel">Contraseña</h2>
      <p className="meta" style={{ marginTop: 0 }}>{sesion.usuario.name} · {sesion.usuario.email}</p>
      {tiene && (
        <>
          <label htmlFor="actual">Contraseña actual</label>
          <input id="actual" type="password" autoComplete="current-password" required value={actual} onChange={(e) => setActual(e.target.value)} />
        </>
      )}
      <label htmlFor="nueva">{tiene ? 'Contraseña nueva' : 'Define una contraseña'}</label>
      <input id="nueva" type="password" autoComplete="new-password" minLength={MIN_LARGO_PASSWORD} required value={nueva} onChange={(e) => setNueva(e.target.value)} />
      <p className="ayuda">Mínimo {MIN_LARGO_PASSWORD} caracteres.</p>
      <button className="btn" style={{ marginTop: 12 }} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      {mensaje && <p className={mensaje.tipo} role="status">{mensaje.texto}</p>}
    </form>
  );
}
