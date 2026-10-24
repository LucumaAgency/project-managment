import type { ReactNode } from 'react';
import Marca from './Marca';

/** Marco de las pantallas sin cuenta (entrar, elegir cuenta, invitación): tarjeta centrada. */
export default function PaginaAcceso({ titulo, subtitulo, children }: { titulo: string; subtitulo?: ReactNode; children: ReactNode }) {
  return (
    <div className="login-pagina">
      <div className="login card">
        <Marca />
        <h2>{titulo}</h2>
        {subtitulo && <p className="meta" style={{ marginTop: 0 }}>{subtitulo}</p>}
        {children}
      </div>
    </div>
  );
}
