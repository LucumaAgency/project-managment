/**
 * Primeros pasos (D-76), como la guía del CRM: un asistente que se abre solo la primera vez que
 * alguien entra a la cuenta, una tarjeta de avance en Proyectos y la opción en el menú de
 * usuario. Qué falta lo decide el servidor mirando los datos (routes/primeros-pasos.ts).
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Rol } from '@lucuma-pm/shared';
import { api } from '../api';
import Icono from './Icono';

export interface Paso {
  id: string;
  titulo: string;
  texto: string;
  enlace: string;
  accion: string;
  hecho: boolean;
  opcional?: boolean;
}

interface Datos {
  rol: Rol;
  pasos: Paso[];
  completados: number;
  total: number;
  abrirAsistente: boolean;
  oculto: boolean;
}

type Accion = 'vista' | 'ocultar' | 'mostrar';

const Ctx = createContext<{ datos: Datos | null; abrir: () => void; marcar: (a: Accion) => void }>({
  datos: null,
  abrir: () => {},
  marcar: () => {},
});

export const useGuia = () => useContext(Ctx);

/**
 * Envuelve la app: carga el avance (al cambiar de página y al volver a la pestaña, porque los
 * pasos se hacen en otras pantallas), abre el asistente solo la primera vez y deja `abrir()`
 * para el menú y la tarjeta.
 */
export function ProveedorGuia({ children }: { children: ReactNode }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [abierta, setAbierta] = useState(false);
  const [autoMostrada, setAutoMostrada] = useState(false);
  const location = useLocation();

  const cargar = useCallback(() => {
    api<Datos>('/primeros-pasos').then(setDatos).catch(() => {});
  }, []);
  useEffect(cargar, [location.pathname, cargar]);
  useEffect(() => {
    const alVolver = () => document.visibilityState === 'visible' && cargar();
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [cargar]);

  useEffect(() => {
    if (datos?.abrirAsistente && !autoMostrada) {
      setAutoMostrada(true);
      setAbierta(true);
    }
  }, [datos, autoMostrada]);

  const marcar = useCallback(
    (a: Accion) => {
      // Al ocultar o mostrar, la tarjeta cambia en el acto; el servidor confirma después.
      if (a !== 'vista') setDatos((d) => (d ? { ...d, oculto: a === 'ocultar' } : d));
      api('/primeros-pasos', { body: { accion: a } }).then(cargar).catch(() => {});
    },
    [cargar],
  );
  const abrir = useCallback(() => {
    if (datos?.oculto) marcar('mostrar');
    setAbierta(true);
  }, [datos, marcar]);

  return (
    <Ctx.Provider value={{ datos, abrir, marcar }}>
      {children}
      {abierta && datos && datos.total > 0 && <Asistente datos={datos} marcar={marcar} onCerrar={() => setAbierta(false)} />}
    </Ctx.Provider>
  );
}

function Estado({ paso }: { paso: Paso }) {
  if (paso.hecho) return <span className="chip chip-verde">Hecho</span>;
  if (paso.opcional) return <span className="chip chip-gris">Opcional</span>;
  return <span className="chip chip-alerta">Pendiente</span>;
}

const BIENVENIDA: Record<Rol, string> = {
  owner:
    'Aquí organizas el trabajo con tu equipo y con tus clientes: cada cliente tiene su proyecto, con tareas, mensajes y archivos en un solo lugar. Primero creas un proyecto y sus tareas, luego invitas a tu equipo y a tu cliente.',
  admin:
    'Aquí organizas el trabajo con tu equipo y con tus clientes: cada cliente tiene su proyecto, con tareas, mensajes y archivos en un solo lugar. Primero creas un proyecto y sus tareas, luego invitas a tu equipo y a tu cliente.',
  member:
    'Aquí está el trabajo de los proyectos donde participas: tareas con responsable y fecha, mensajes y archivos. Te mostramos lo básico para empezar.',
  client:
    'Aquí sigues el trabajo que la agencia hace para ti: qué está pasando, qué necesita de ti y los archivos que te entrega, sin buscar en el chat.',
};

function Asistente({ datos, marcar, onCerrar }: { datos: Datos; marcar: (a: Accion) => void; onCerrar: () => void }) {
  const navegar = useNavigate();
  // Empieza en el primer paso pendiente si ya hubo avance; si no, en la bienvenida.
  const primeroPendiente = datos.pasos.findIndex((p) => !p.hecho);
  const [i, setI] = useState(datos.completados > 0 && primeroPendiente >= 0 ? primeroPendiente + 1 : 0);
  const ultimo = datos.pasos.length + 1;
  const paso = i >= 1 && i <= datos.pasos.length ? datos.pasos[i - 1]! : null;

  const cerrar = useCallback(() => {
    marcar('vista');
    onCerrar();
  }, [marcar, onCerrar]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && cerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [cerrar]);
  function ir(p: Paso) {
    cerrar();
    navegar(p.enlace);
  }

  return (
    <div className="modal-fondo" onClick={cerrar}>
      <div className="modal pp-modal" role="dialog" aria-modal="true" aria-labelledby="pp-titulo" onClick={(e) => e.stopPropagation()}>
        <div className="modal-cab">
          <span className="pp-eyebrow">Primeros pasos{paso ? ` · ${i} de ${datos.pasos.length}` : ''}</span>
          <button type="button" className="cerrar" onClick={cerrar} aria-label="Cerrar">×</button>
        </div>

        <div className="pp-puntos" aria-hidden="true">
          {datos.pasos.map((p, n) => (
            <button
              key={p.id}
              type="button"
              tabIndex={-1}
              className={`pp-punto${n + 1 === i ? ' activo' : ''}${p.hecho ? ' hecho' : ''}`}
              onClick={() => setI(n + 1)}
            />
          ))}
        </div>

        {i === 0 && (
          <div className="pp-cuerpo">
            <h2 id="pp-titulo">Te damos la bienvenida</h2>
            <p>{BIENVENIDA[datos.rol]}</p>
            <p className="meta">
              {datos.completados > 0 ? `Ya tienes ${datos.completados} de ${datos.total} listos.` : 'Cada paso se marca solo cuando lo haces.'}{' '}
              Puedes cerrar la guía cuando quieras y volver desde tu menú (abajo a la izquierda, en tu nombre) o desde Proyectos.
            </p>
          </div>
        )}

        {paso && (
          <div className="pp-cuerpo">
            <div className="pp-titulo-paso">
              <span className={`pp-num${paso.hecho ? ' hecho' : ''}`}>{paso.hecho ? <Icono nombre="check" tam={16} /> : i}</span>
              <h2 id="pp-titulo">{paso.titulo}</h2>
            </div>
            <p>{paso.texto}</p>
            <div className="pp-estado">
              <Estado paso={paso} />
              {paso.hecho && <span className="meta">Ya está. Puedes revisarlo o seguir.</span>}
            </div>
            <button type="button" className={paso.hecho ? 'btn btn-sec' : 'btn'} onClick={() => ir(paso)}>
              {paso.accion}
            </button>
          </div>
        )}

        {i === ultimo && (
          <div className="pp-cuerpo">
            <h2 id="pp-titulo">{datos.completados === datos.total ? 'Todo listo' : `Llevas ${datos.completados} de ${datos.total}`}</h2>
            <ul className="pp-lista">
              {datos.pasos.map((p, n) => (
                <li key={p.id}>
                  <button type="button" className="pp-enlace" onClick={() => setI(n + 1)}>
                    <span className={`pp-num chico${p.hecho ? ' hecho' : ''}`}>{p.hecho ? <Icono nombre="check" tam={12} /> : n + 1}</span>
                    {p.titulo}
                  </button>
                  <Estado paso={p} />
                </li>
              ))}
            </ul>
            <p className="meta">La tarjeta «Primeros pasos» de Proyectos te muestra lo que falta hasta terminar.</p>
          </div>
        )}

        <div className="pp-pie">
          <button type="button" className="btn btn-sec" disabled={i === 0} onClick={() => setI(i - 1)}>
            Anterior
          </button>
          {i < ultimo ? (
            <button type="button" className="btn" onClick={() => setI(i + 1)}>
              {i === 0 ? 'Empezar' : 'Siguiente'}
            </button>
          ) : (
            <button type="button" className="btn" onClick={cerrar}>
              Cerrar guía
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Tarjeta de Proyectos: avance y pasos pendientes, hasta terminar u ocultarla. */
export function TarjetaPrimerosPasos() {
  const { datos: d, abrir, marcar } = useGuia();
  const navegar = useNavigate();
  if (!d || d.total === 0) return null;
  // Sin la tarjeta (oculta o todo hecho) queda un aviso discreto para reabrir la guía.
  if (d.oculto || d.completados === d.total) {
    return (
      <div className="pp-banner">
        <Icono nombre="check" tam={18} />
        <span className="pp-banner-texto">
          <strong>¿Necesitas repasar cómo se usa?</strong>{' '}
          <span className="meta">
            {d.completados === d.total ? 'Ya completaste los primeros pasos; la guía sigue disponible.' : `Llevas ${d.completados} de ${d.total} primeros pasos.`}
          </span>
        </span>
        {d.completados < d.total && (
          <button type="button" className="btn btn-sec btn-chico" onClick={() => marcar('mostrar')}>
            Mostrar mi avance
          </button>
        )}
        <button type="button" className="btn btn-sec btn-chico" onClick={abrir}>
          Abrir guía
        </button>
      </div>
    );
  }
  const pct = Math.round((d.completados / d.total) * 100);
  return (
    <section className="card pp-tarjeta">
      <div className="pp-tarjeta-cab">
        <h2 className="titulo-panel">
          <Icono nombre="check" tam={16} />Primeros pasos <span className="chip chip-gris">{d.completados} de {d.total}</span>
        </h2>
        <div className="pp-acciones">
          <button type="button" className="btn btn-sec btn-chico" onClick={abrir}>Abrir guía</button>
          <button type="button" className="btn btn-sec btn-chico" onClick={() => marcar('ocultar')}>Ocultar</button>
        </div>
      </div>
      <div className="pp-barra" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <ul className="pp-lista pp-lista-tarjeta">
        {d.pasos.map((p, n) => (
          <li key={p.id} className={p.hecho ? 'hecho' : ''}>
            <button type="button" className="pp-enlace" onClick={() => navegar(p.enlace)} disabled={p.hecho}>
              <span className={`pp-num chico${p.hecho ? ' hecho' : ''}`}>{p.hecho ? <Icono nombre="check" tam={12} /> : n + 1}</span>
              {p.titulo}
            </button>
            {!p.hecho && <span className="pp-ir">{p.accion} →</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
