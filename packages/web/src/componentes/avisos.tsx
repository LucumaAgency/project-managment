import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';

/**
 * Número de avisos sin leer, para el menú y el título de la pestaña. Se pide cada 30 s y al
 * cambiar de página; las páginas que marcan avisos como leídos llaman a `refrescar()`.
 */
const Ctx = createContext<{ noLeidos: number; refrescar: () => void }>({ noLeidos: 0, refrescar: () => {} });
const CADA_MS = 30_000;
const TITULO = 'Lucuma Proyectos';

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [noLeidos, setNoLeidos] = useState(0);
  const location = useLocation();
  const refrescar = useCallback(() => {
    api<{ noLeidos: number }>('/bandeja/contador').then((r) => setNoLeidos(r.noLeidos)).catch(() => {});
  }, []);
  useEffect(() => {
    refrescar();
    const t = setInterval(() => document.visibilityState === 'visible' && refrescar(), CADA_MS);
    return () => clearInterval(t);
  }, [refrescar]);
  useEffect(refrescar, [location.pathname, refrescar]);
  useEffect(() => {
    document.title = noLeidos ? `(${noLeidos}) ${TITULO}` : TITULO;
  }, [noLeidos]);
  return <Ctx.Provider value={{ noLeidos, refrescar }}>{children}</Ctx.Provider>;
}

export const useAvisos = () => useContext(Ctx);

/** Al abrir una tarea, un mensaje o un archivo: sus avisos quedan leídos. */
export function useLeerAvisosDe(recordingId: string | null | undefined) {
  const { refrescar } = useAvisos();
  useEffect(() => {
    if (!recordingId) return;
    api('/bandeja/leer', { body: { recordingId } }).then(refrescar).catch(() => {});
  }, [recordingId, refrescar]);
}
