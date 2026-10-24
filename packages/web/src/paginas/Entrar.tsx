import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ErrorApi, type Sesion } from '../api';
import PaginaAcceso from '../componentes/PaginaAcceso';
import { despuesDeEntrar, useConfig } from '../contexto';

/**
 * Entrar con correo y contraseña. El enlace al correo solo aparece si hay correo saliente
 * (en el MVP no lo hay: la contraseña la entrega quien crea la cuenta o la invitación).
 */
export default function Entrar() {
  const config = useConfig();
  const navegar = useNavigate();
  const [modo, setModo] = useState<'password' | 'enlace'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setMensaje(null);
    try {
      if (modo === 'enlace') {
        const r = await api<{ mensaje: string }>('/auth/enlace', { body: { email } });
        setMensaje({ tipo: 'ok', texto: r.mensaje });
      } else {
        const sesion = await api<Sesion>('/auth/entrar', { body: { email, password } });
        despuesDeEntrar(config, sesion, navegar);
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ErrorApi ? err.message : 'No se pudo conectar.' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PaginaAcceso titulo={modo === 'password' ? 'Inicia sesión' : 'Entrar con enlace'} subtitulo="Proyectos y clientes, en un solo lugar">
      <form onSubmit={enviar}>
        <label htmlFor="email">Correo</label>
        <input id="email" type="email" autoComplete="email" placeholder="tu@empresa.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {modo === 'password' && (
          <>
            <label htmlFor="password">Contraseña</label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </>
        )}
        <button className="btn btn-bloque" style={{ marginTop: 16 }} disabled={enviando}>
          {enviando ? (modo === 'password' ? 'Entrando…' : 'Enviando…') : modo === 'password' ? 'Entrar' : 'Enviar enlace'}
        </button>
      </form>
      {mensaje && <p className={mensaje.tipo} role="status">{mensaje.texto}</p>}
      <p className="meta pie">
        {config.correo ? (
          <button type="button" className="btn-texto" onClick={() => { setModo(modo === 'password' ? 'enlace' : 'password'); setMensaje(null); }}>
            {modo === 'password' ? '¿Sin contraseña u olvidada? Entra con enlace al correo' : 'Entrar con contraseña'}
          </button>
        ) : (
          '¿Olvidaste tu contraseña? Pide a soporte de Lucuma que te genere una nueva.'
        )}
      </p>
    </PaginaAcceso>
  );
}
