import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ErrorApi, type Sesion } from '../api';
import { despuesDeEntrar, useConfig } from '../contexto';

/** Entrar: por defecto con enlace al correo; contraseña opcional. */
export default function Entrar() {
  const config = useConfig();
  const navegar = useNavigate();
  const [modo, setModo] = useState<'enlace' | 'password'>('enlace');
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
    <div className="centro">
      <form className="tarjeta" onSubmit={enviar}>
        <h1>Entrar</h1>
        <p className="suave">
          {modo === 'enlace' ? 'Te enviamos un enlace al correo para entrar sin contraseña.' : 'Entra con tu correo y contraseña.'}
        </p>
        <label htmlFor="email">Correo</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {modo === 'password' && (
          <>
            <label htmlFor="password">Contraseña</label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </>
        )}
        <button className="primario" disabled={enviando}>
          {enviando ? 'Un momento…' : modo === 'enlace' ? 'Enviarme el enlace' : 'Entrar'}
        </button>
        {mensaje && <p className={`mensaje ${mensaje.tipo}`} role="status">{mensaje.texto}</p>}
        <p className="mensaje">
          <button type="button" className="enlace" onClick={() => { setModo(modo === 'enlace' ? 'password' : 'enlace'); setMensaje(null); }}>
            {modo === 'enlace' ? 'Prefiero usar contraseña' : 'Prefiero un enlace al correo'}
          </button>
        </p>
      </form>
    </div>
  );
}
