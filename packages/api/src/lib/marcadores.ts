/**
 * Marcadores de fecha en los nombres de las plantillas (D-73): el nombre de la lista y la
 * carpeta que crea una plantilla pueden decir de qué mes son.
 *
 *   {mes}        → "Noviembre 2026"  (el mes del día de inicio)
 *   {mes-1}      → "Octubre 2026"    (el mes anterior: el reporte del día 1 es del mes pasado)
 *   {aaaa-mm}    → "2026-11"
 *   {aaaa-mm-1}  → "2026-10"
 */
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const MARCADORES = ['{mes}', '{mes-1}', '{aaaa-mm}', '{aaaa-mm-1}'] as const;

/** `dia` = AAAA-MM-DD. */
export function expandirMarcadores(texto: string, dia: string): string {
  const [a, m] = dia.split('-').map(Number);
  const [aa, ma] = m === 1 ? [a - 1, 12] : [a, m - 1];
  const dos = (n: number) => String(n).padStart(2, '0');
  return texto
    .replaceAll('{mes-1}', `${MESES[ma - 1]} ${aa}`)
    .replaceAll('{mes}', `${MESES[m - 1]} ${a}`)
    .replaceAll('{aaaa-mm-1}', `${aa}-${dos(ma)}`)
    .replaceAll('{aaaa-mm}', `${a}-${dos(m)}`);
}

/** El primer día con número `diaDelMes` que cae DESPUÉS de `desde` (AAAA-MM-DD). */
export function siguienteDiaDelMes(desde: string, diaDelMes: number): string {
  const [a, m, d] = desde.split('-').map(Number);
  const dos = (n: number) => String(n).padStart(2, '0');
  if (d < diaDelMes) return `${a}-${dos(m)}-${dos(diaDelMes)}`;
  const [an, mn] = m === 12 ? [a + 1, 1] : [a, m + 1];
  return `${an}-${dos(mn)}-${dos(diaDelMes)}`;
}
