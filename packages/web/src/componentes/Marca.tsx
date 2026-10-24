/** Wordmark tipográfico de Lucuma (igual que el CRM) con el nombre del producto. */
export default function Marca() {
  return (
    <div className="marca">
      <span className="wordmark">Lucuma Agency</span>
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
