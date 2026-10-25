import { useEffect, useState } from 'react';
import { NavLink, Outlet, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { NOMBRE_ROL, esCliente } from '@lucuma-pm/shared';
import { api, ErrorApi, olvidarCuentaLocal, type Sesion, type Yo } from '../api';
import { useConfig, YoCtx } from '../contexto';
import { cuentaActual, irACuenta, irARaiz } from '../cuenta';
import { ProveedorAvisos, useAvisos } from './avisos';
import Icono from './Icono';
import Marca, { iniciales } from './Marca';
import PaginaAcceso from './PaginaAcceso';
import { AtajoDeErrores } from './errores';

/** Título de la barra superior según la ruta. */
const TITULOS: [string, string][] = [
  ['/', 'Proyectos'],
  ['/proyectos/:id/tareas', 'Tareas'],
  ['/proyectos/:id/mensajes/:mensajeId', 'Mensaje'],
  ['/proyectos/:id/mensajes', 'Mensajes'],
  ['/proyectos/:id/actividad', 'Actividad'],
  ['/proyectos/:id/archivos/:archivoId', 'Archivo'],
  ['/proyectos/:id/archivos', 'Archivos'],
  ['/proyectos/:id/papelera', 'Papelera'],
  ['/proyectos/:id', 'Proyecto'],
  ['/personas', 'Personas'],
  ['/plantillas/:id', 'Plantilla'],
  ['/plantillas', 'Plantillas'],
  ['/bandeja', 'Bandeja'],
  ['/buscar', 'Buscar'],
  ['/mi-cuenta', 'Mi cuenta'],
];

/**
 * Todo lo que vive dentro de una cuenta: menú lateral (cajón en celular), barra superior y la
 * página. Carga /yo una vez y lo comparte con las páginas. Sin cuenta (raíz), "/" decide a
 * dónde ir: directo a tu única cuenta, o al selector.
 */
export default function Marco() {
  const config = useConfig();
  const navegar = useNavigate();
  const location = useLocation();
  const slug = cuentaActual(config);
  const [yo, setYo] = useState<Yo | null>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [menuUsuario, setMenuUsuario] = useState(false);

  useEffect(() => {
    if (!slug) {
      api<Sesion>('/auth/sesion')
        .then((s) =>
          s.cuentas.length === 1 && !s.usuario.soporte ? irACuenta(config, s.cuentas[0].slug) : navegar('/cuentas', { replace: true })
        )
        .catch(() => navegar('/entrar', { replace: true }));
      return;
    }
    api<Yo>('/yo')
      .then(setYo)
      .catch((e) => {
        if (e instanceof ErrorApi && e.status === 401) return navegar('/entrar', { replace: true });
        setProblema(e instanceof ErrorApi ? e.message : 'No se pudo conectar.');
      });
  }, [slug, config, navegar]);

  // En celular el lateral es un cajón: navegar lo cierra, o tapa lo que se acaba de pedir.
  useEffect(() => {
    setMenuAbierto(false);
    setMenuUsuario(false);
  }, [location.pathname]);

  // "/" abre la búsqueda desde cualquier pantalla (si no se está escribiendo en un campo).
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      e.preventDefault();
      navegar('/buscar');
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [navegar]);

  const verCuentas = () => {
    olvidarCuentaLocal();
    irARaiz(config);
  };

  async function salir() {
    await api('/auth/salir', { body: {} }).catch(() => {});
    olvidarCuentaLocal();
    irARaiz(config, '/entrar');
  }

  if (problema) {
    return (
      <PaginaAcceso titulo="No se puede abrir esta cuenta">
        <p className="error">{problema}</p>
        <button type="button" className="btn btn-bloque" style={{ marginTop: 16 }} onClick={verCuentas}>Ver mis cuentas</button>
      </PaginaAcceso>
    );
  }
  if (!yo) return null;

  const enlace = ({ isActive }: { isActive: boolean }) => (isActive ? 'activo' : '');
  const titulo = TITULOS.find(([patron]) => matchPath(patron, location.pathname))?.[1] ?? yo.cuenta.name;

  return (
    <YoCtx.Provider value={yo}>
      <ProveedorAvisos>
      <div className="app">
        <aside className={`lateral${menuAbierto ? ' abierto' : ''}`}>
          <Marca />
          <div className="lateral-cuenta" title={yo.cuenta.name}>{yo.cuenta.name}</div>
          <nav className="lateral-nav">
            <div className="nav-seccion">Menú</div>
            <NavLink to="/" className={({ isActive }) => (isActive || location.pathname.startsWith('/proyectos') ? 'activo' : '')} end>
              <Icono nombre="proyectos" />Proyectos
            </NavLink>
            <NavLink to="/buscar" className={enlace}>
              <Icono nombre="buscar" />Buscar
            </NavLink>
            <EnlaceBandeja />
            {!esCliente(yo.rol) && (
              <NavLink to="/personas" className={enlace}>
                <Icono nombre="personas" />Personas
              </NavLink>
            )}
            {!esCliente(yo.rol) && (
              <NavLink to="/plantillas" className={enlace}>
                <Icono nombre="plantilla" />Plantillas
              </NavLink>
            )}
          </nav>

          <div className="lateral-pie">
            {menuUsuario && (
              <div className="usuario-menu" role="menu">
                <NavLink to="/mi-cuenta" role="menuitem">
                  <Icono nombre="cuenta" tam={16} />Mi cuenta
                </NavLink>
                <button type="button" role="menuitem" onClick={verCuentas}>
                  <Icono nombre="cambiar" tam={16} />Cambiar de cuenta
                </button>
                <button type="button" role="menuitem" onClick={salir}>
                  <Icono nombre="salir" tam={16} />Cerrar sesión
                </button>
              </div>
            )}
            <button type="button" className="usuario" aria-expanded={menuUsuario} onClick={() => setMenuUsuario((v) => !v)}>
              <span className="avatar">{iniciales(yo.usuario.name)}</span>
              <span className="datos">
                <div className="nombre">{yo.usuario.name}</div>
                <div className="meta">{yo.soporte ? 'Soporte de Lucuma' : NOMBRE_ROL[yo.rol]}</div>
              </span>
              <Icono nombre="selector" tam={16} />
            </button>
          </div>
        </aside>

        {menuAbierto && <div className="velo" onClick={() => setMenuAbierto(false)} />}

        <div className="principal">
          <header className="topbar">
            <button
              type="button"
              className="hamburguesa"
              aria-label="Abrir menú"
              aria-expanded={menuAbierto}
              onClick={() => setMenuAbierto((v) => !v)}
            >
              <Icono nombre="menu" tam={20} />
            </button>
            <h1>{titulo}</h1>
            <span className="org">{yo.cuenta.name}</span>
            <NavLink to="/buscar" className="btn-icono buscar-arriba" aria-label="Buscar" title="Buscar (/)">
              <Icono nombre="buscar" tam={20} />
            </NavLink>
          </header>
          {yo.soporte && (
            <div className="franja-soporte" role="status">
              <Icono nombre="escudo" tam={16} />
              Estás como soporte de Lucuma, con permisos de administrador. Tu entrada queda registrada.
            </div>
          )}
          <main className="contenido">
            {/* Por página (y se reinicia al navegar): si una pantalla se rompe, el menú sigue. */}
            <AtajoDeErrores key={location.pathname}>
              <Outlet />
            </AtajoDeErrores>
          </main>
        </div>
      </div>
      </ProveedorAvisos>
    </YoCtx.Provider>
  );
}

function EnlaceBandeja() {
  const { noLeidos } = useAvisos();
  return (
    <NavLink to="/bandeja" className={({ isActive }) => (isActive ? 'activo' : '')}>
      <Icono nombre="bandeja" />Bandeja
      {noLeidos > 0 && <span className="globo" aria-label={`${noLeidos} sin leer`}>{noLeidos > 99 ? '99+' : noLeidos}</span>}
    </NavLink>
  );
}
