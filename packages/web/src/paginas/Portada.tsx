import { NOMBRE_ROL } from '@lucuma-pm/shared';
import Icono from '../componentes/Icono';
import { useYo } from '../contexto';

/** Inicio de la cuenta. Los proyectos llegan el día 5; por ahora, quién eres y dónde estás. */
export default function Portada() {
  const yo = useYo();
  return (
    <>
      <p className="saludo">Hola, {yo.usuario.name.split(' ')[0]}</p>
      <p className="meta" style={{ marginTop: 0 }}>
        Estás en {yo.cuenta.name} como {yo.soporte ? 'soporte de Lucuma' : NOMBRE_ROL[yo.rol].toLowerCase()}.
      </p>
      <div className="card vacio">
        <Icono nombre="proyectos" tam={28} />
        <p className="nombre" style={{ margin: '8px 0 2px', color: 'var(--texto)' }}>Todavía no hay proyectos</p>
        <p className="meta" style={{ margin: 0 }}>Aquí vas a ver los proyectos de la cuenta.</p>
      </div>
    </>
  );
}
