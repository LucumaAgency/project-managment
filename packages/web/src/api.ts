/**
 * Cliente de la API. En producción la cuenta sale del subdominio (la API la lee del Host).
 * En local, sin dominio base, la web la guarda y la manda en el encabezado X-Cuenta.
 */
const CLAVE_CUENTA = 'pm_cuenta';

export class ErrorApi extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function cuentaLocal(): string | null {
  const deUrl = new URLSearchParams(window.location.search).get('cuenta');
  if (deUrl) {
    try {
      sessionStorage.setItem(CLAVE_CUENTA, deUrl);
    } catch {
      /* sin almacenamiento: se usa la de la URL */
    }
    return deUrl;
  }
  try {
    return sessionStorage.getItem(CLAVE_CUENTA);
  } catch {
    return null;
  }
}

export function olvidarCuentaLocal() {
  try {
    sessionStorage.removeItem(CLAVE_CUENTA);
  } catch {
    /* nada */
  }
}

export async function api<T>(ruta: string, opciones: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opciones.body !== undefined) headers['content-type'] = 'application/json';
  const cuenta = cuentaLocal();
  if (cuenta) headers['x-cuenta'] = cuenta;

  const r = await fetch(`/api/v1${ruta}`, {
    method: opciones.method ?? (opciones.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
    credentials: 'same-origin',
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorApi(r.status, (datos as { error?: string }).error ?? 'Algo salió mal.');
  return datos as T;
}

export interface Config {
  baseDomain: string;
}
export interface CuentaDeUsuario {
  id: string;
  slug: string;
  name: string;
  role: string;
}
export interface Sesion {
  usuario: { id: string; name: string; email: string; tienePassword: boolean };
  cuentas: CuentaDeUsuario[];
}
export interface Yo {
  usuario: { id: string; name: string; email: string };
  cuenta: { id: string; slug: string; name: string; plan: string };
  rol: string;
}
