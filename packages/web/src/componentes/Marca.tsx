/**
 * Marca del menú: el nombre de la cuenta (cada agencia ve la suya) con el nombre del producto.
 * Sin cuenta (entrar, elegir cuenta, invitación) muestra solo «Proyectos», sin marca de nadie.
 */
export default function Marca({ nombre }: { nombre?: string }) {
  if (!nombre) {
    return (
      <div className="marca">
        <span className="wordmark">Proyectos</span>
      </div>
    );
  }
  return (
    <div className="marca">
      <span className="wordmark" title={nombre}>{nombre}</span>
      <span className="producto">Proyectos</span>
    </div>
  );
}
export function iniciales(nombre: string) {
  return (
    nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('') || '?'
  );
}
