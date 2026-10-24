import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Config, type Sesion, type Yo } from './api';
import { cuentaActual, irACuenta } from './cuenta';

const ConfigCtx = createContext<Config | null>(null);

/** Carga /config una vez (dominio base, si hay correo) antes de mostrar cualquier pantalla. */
export function ProveedorConfig({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    api<Config>('/config').then(setConfig).catch(() => setError(true));
  }, []);
  if (error) return <div className="vacio">No se pudo conectar con el servidor. Recarga la página.</div>;
  if (!config) return null;
  return <ConfigCtx.Provider value={config}>{children}</ConfigCtx.Provider>;
}

export function useConfig(): Config {
  const c = useContext(ConfigCtx);
  if (!c) throw new Error('useConfig fuera de ProveedorConfig');
  return c;
}

/** Quién soy en la cuenta actual. Lo carga el Marco; lo leen las páginas de adentro. */
export const YoCtx = createContext<Yo | null>(null);

export function useYo(): Yo {
  const y = useContext(YoCtx);
  if (!y) throw new Error('useYo fuera del Marco');
  return y;
}

/**
 * Tras entrar: si la página ya está en una cuenta tuya, se queda; si tienes una sola cuenta,
 * va directo; si tienes varias (o ninguna, o eres soporte), al selector.
 */
export function despuesDeEntrar(config: Config, sesion: Sesion, navegar: (ruta: string) => void) {
  const actual = cuentaActual(config);
  if (actual && (sesion.usuario.soporte || sesion.cuentas.some((c) => c.slug === actual))) return navegar('/');
  if (sesion.cuentas.length === 1 && !sesion.usuario.soporte) return irACuenta(config, sesion.cuentas[0].slug);
  navegar('/cuentas');
}
