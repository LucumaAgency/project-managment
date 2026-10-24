import { useEffect, type ReactNode } from 'react';

/** Hoja inferior en celular, ventana centrada en escritorio. Cierra con Esc o tocando afuera. */
export default function Modal({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="modal-cab">
          <h2>{titulo}</h2>
          <button type="button" className="cerrar" aria-label="Cerrar" onClick={onCerrar}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
