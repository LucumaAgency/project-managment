import { useEffect, useState, type FormEvent } from 'react';
import { MIN_LARGO_PASSWORD } from '@lucuma-pm/shared';
import { api, ErrorApi, urlExportar, type Sesion } from '../api';
import Icono from '../componentes/Icono';
import { useYo } from '../contexto';

/** Datos propios: la contraseña y, para el dueño, exportar la cuenta. */
export default function MiCuenta() {
  const yo = useYo();
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
    <>
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
    {yo.rol === 'owner' && !yo.soporte && (
      <section className="card card-estrecha" style={{ marginTop: 16 }}>
        <h2 className="titulo-panel">Exportar la cuenta</h2>
        <p className="meta" style={{ marginTop: 0 }}>
          Un ZIP con todo lo de «{yo.cuenta.name}»: proyectos, tareas (también en Excel), mensajes, comentarios, archivos con sus
          versiones y la actividad. Incluye lo archivado y lo que está en la papelera. Puede tardar si hay muchos archivos.
        </p>
        <a className="btn btn-sec" href={urlExportar()} download>
          <Icono nombre="descargar" tam={16} />Descargar ZIP
        </a>
      </section>
    )}
    </>
  );
}
