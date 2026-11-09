import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { veTodosLosProyectos } from '@lucuma-pm/shared';
import { api, ErrorApi, type EstadoProyecto, type ProyectoResumen } from '../api';
import Icono from '../componentes/Icono';
import NuevoProyecto from '../componentes/NuevoProyecto';
import { TarjetaPrimerosPasos } from '../componentes/PrimerosPasos';
import { useYo } from '../contexto';

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });

const PESTANAS: { estado: EstadoProyecto; nombre: string; soloGestion?: boolean }[] = [
  { estado: 'active', nombre: 'Activos' },
  { estado: 'archived', nombre: 'Archivados' },
  { estado: 'trashed', nombre: 'Papelera', soloGestion: true },
];

/** Inicio de la cuenta: los proyectos que puedo ver. */
export default function Portada() {
  const yo = useYo();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const estado = (params.get('estado') as EstadoProyecto | null) ?? 'active';
  const [datos, setDatos] = useState<{ proyectos: ProyectoResumen[]; puedeCrear: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(() => {
    setDatos(null);
    api<{ proyectos: ProyectoResumen[]; puedeCrear: boolean }>(`/proyectos?estado=${estado}`)
      .then(setDatos)
      .catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar.'));
  }, [estado]);
  useEffect(cargar, [cargar]);

  const pestanas = PESTANAS.filter((p) => !p.soloGestion || veTodosLosProyectos(yo.rol));
  const cambiarPestana = (e: EstadoProyecto) => {
    const p = new URLSearchParams(params);
    if (e === 'active') p.delete('estado');
    else p.set('estado', e);
    setParams(p);
  };

  return (
    <>
      <div className="herramientas">
        <div className="empuja">
          <p className="saludo" style={{ margin: 0 }}>Hola, {yo.usuario.name.split(' ')[0]}</p>
          <div className="meta">{yo.soporte ? 'Estás como soporte de Lucuma.' : `Proyectos de ${yo.cuenta.name}`}</div>
        </div>
        {datos?.puedeCrear && estado === 'active' && (
          <button type="button" className="btn" onClick={() => setCreando(true)}>
            <Icono nombre="mas" tam={16} />Nuevo proyecto
          </button>
        )}
      </div>

      {estado === 'active' && <TarjetaPrimerosPasos />}

      <div className="pestanas" role="tablist">
        {pestanas.map((p) => (
          <button key={p.estado} type="button" role="tab" aria-selected={estado === p.estado} className={estado === p.estado ? 'activa' : ''} onClick={() => cambiarPestana(p.estado)}>
            {p.nombre}
          </button>
        ))}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!datos ? (
        !error && <p className="cargando">Cargando…</p>
      ) : datos.proyectos.length === 0 ? (
        <div className="card vacio">
          <Icono nombre="proyectos" tam={28} />
          <p className="nombre" style={{ margin: '8px 0 2px', color: 'var(--texto)' }}>
            {estado === 'active' ? 'Todavía no hay proyectos' : estado === 'archived' ? 'No hay proyectos archivados' : 'La papelera está vacía'}
          </p>
          <p className="meta" style={{ margin: 0 }}>
            {estado === 'active'
              ? datos.puedeCrear
                ? 'Crea el primero para empezar a trabajar con tu equipo y tus clientes.'
                : 'Cuando te sumen a un proyecto, aparecerá aquí.'
              : estado === 'trashed'
                ? 'Lo que mandes a la papelera queda aquí y se puede restaurar.'
                : 'Los proyectos terminados se archivan: se pueden leer, pero no cambiar.'}
          </p>
        </div>
      ) : (
        <div className="rejilla-proyectos">
          {datos.proyectos.map((p) => (
            <Link key={p.id} to={`/proyectos/${p.id}`} className="tarjeta-proyecto">
              <span className="cabeza">
                <span className="nombre">{p.name}</span>
                <span
                  className={`contador-pendientes${p.pendientes ? '' : ' cero'}`}
                  title={p.pendientes ? `${p.pendientes} ${p.pendientes === 1 ? 'tarea pendiente' : 'tareas pendientes'}` : 'Sin tareas pendientes'}
                >
                  <Icono nombre="tareas" tam={13} />
                  {p.pendientes}
                  <span className="sr">{p.pendientes === 1 ? ' tarea pendiente' : ' tareas pendientes'}</span>
                </span>
              </span>
              <span className="descripcion">{p.description || 'Sin descripción'}</span>
              <span className="pie">
                <Icono nombre="personas" tam={14} />
                {p.personas} {p.personas === 1 ? 'persona' : 'personas'}
                <span style={{ marginLeft: 'auto' }}>
                  {p.status === 'trashed' && p.trashedAt
                    ? `En la papelera desde el ${fecha(p.trashedAt)}`
                    : p.status === 'archived' && p.archivedAt
                      ? `Archivado el ${fecha(p.archivedAt)}`
                      : `Última actividad el ${fecha(p.ultimaActividad)}`}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {creando && <NuevoProyecto onCerrar={() => setCreando(false)} onListo={(id) => navegar(`/proyectos/${id}`)} />}
    </>
  );
}

