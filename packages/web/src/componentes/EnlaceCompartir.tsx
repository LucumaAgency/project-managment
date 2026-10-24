import { useRef, useState } from 'react';
import Icono from './Icono';

/**
 * Enlace de invitación para compartir a mano (en el MVP no hay correo). Copiar el enlace,
 * copiar un mensaje listo o abrirlo en WhatsApp (solo abre wa.me con el texto: no hay
 * integración con WhatsApp).
 */
export default function EnlaceCompartir({ enlace, mensaje }: { enlace: string; mensaje: string }) {
  const campo = useRef<HTMLInputElement>(null);
  const [copiado, setCopiado] = useState<'enlace' | 'mensaje' | null>(null);

  async function copiar(texto: string, que: 'enlace' | 'mensaje') {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Sin HTTPS (p. ej. lvh.me en local) el portapapeles moderno no está: método antiguo.
      const area = document.createElement('textarea');
      area.value = texto;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopiado(que);
    setTimeout(() => setCopiado(null), 2000);
  }

  return (
    <div>
      <label htmlFor="enlace-invitacion">Enlace de invitación</label>
      <div className="copiar">
        <input id="enlace-invitacion" ref={campo} readOnly value={enlace} onFocus={(e) => e.target.select()} />
        <button type="button" className="btn" onClick={() => copiar(enlace, 'enlace')}>
          <Icono nombre={copiado === 'enlace' ? 'check' : 'copiar'} tam={16} />
          {copiado === 'enlace' ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <div className="acciones">
        <button type="button" className="btn btn-sec" onClick={() => copiar(mensaje, 'mensaje')}>
          <Icono nombre={copiado === 'mensaje' ? 'check' : 'copiar'} tam={16} />
          {copiado === 'mensaje' ? 'Mensaje copiado' : 'Copiar mensaje'}
        </button>
        <a className="btn btn-sec" href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noreferrer">
          <Icono nombre="whatsapp" tam={16} />Abrir en WhatsApp
        </a>
      </div>
      <p className="aviso ambar">
        Quien tenga este enlace puede aceptar la invitación. Compártelo solo con esa persona. Vence en 7 días y sirve una vez.
      </p>
    </div>
  );
}

/** Texto listo para pegar en WhatsApp junto al enlace. */
export function mensajeInvitacion(cuenta: string, enlace: string, proyecto?: string) {
  const donde = proyecto ? `al proyecto ${proyecto} de ${cuenta}` : `a ${cuenta}`;
  return `Hola, te invito ${donde} en Lucuma Proyectos. Entra a este enlace para crear tu acceso (vence en 7 días):\n${enlace}`;
}
