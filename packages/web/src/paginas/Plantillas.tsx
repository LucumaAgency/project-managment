import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ErrorApi, type Plantillas as DatosPlantillas } from '../api';
import Icono from '../componentes/Icono';

/** Plantillas de lista de la cuenta: onboarding de cliente y una por servicio (D-64). */
export default function Plantillas() {
  const [datos, setDatos] = useState<DatosPlantillas | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<DatosPlantillas>('/plantillas').then(setDatos).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo conectar.'));
  }, []);

  if (!datos) return error ? <p className="error">{error}</p> : <p className="cargando">Cargando…</p>;
  return (
    <>
      <div className="herramientas">
        <div className="empuja">
          <h2 style={{ fontSize: 20 }}>Plantillas</h2>
          <p className="meta" style={{ margin: '2px 0 0' }}>Pasos que se repiten con cada cliente. Se agregan a un proyecto desde Tareas.</p>
        </div>
        {datos.permisos.gestionar && (
          <Link to="/plantillas/nueva" className="btn"><Icono nombre="mas" tam={16} />Nueva plantilla</Link>
        )}
      </div>
      {datos.plantillas.length === 0 ? (
        <div className="card vacio">
          <Icono nombre="plantilla" tam={28} />
          <p className="nombre" style={{ margin: '8px 0 2px', color: 'var(--texto)' }}>Todavía no hay plantillas</p>
          <p className="meta" style={{ margin: 0 }}>
            {datos.permisos.gestionar
              ? 'Crea una (por ejemplo "Onboarding de cliente") o guarda como plantilla una lista que ya salió bien.'
              : 'Un administrador puede crear plantillas para los procesos que se repiten.'}
          </p>
        </div>
      ) : (
        <div className="rejilla-proyectos">
          {datos.plantillas.map((p) => (
            <Link key={p.id} to={`/plantillas/${p.id}`} className="tarjeta-proyecto">
              <span className="nombre">{p.name}</span>
              <span className="descripcion">{p.description || 'Sin descripción'}</span>
              <span className="pie">
                <Icono nombre="tareas" tam={14} />
                {p.tareas} {p.tareas === 1 ? 'tarea' : 'tareas'}
                {p.delCliente > 0 && <span className="chip chip-verde" style={{ marginLeft: 'auto' }}>{p.delCliente} para el cliente</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
