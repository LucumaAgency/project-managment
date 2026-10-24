/**
 * Piezas puras de la búsqueda (D-57): normalizar como la base, armar la consulta y recortar
 * el fragmento con lo encontrado marcado.
 */

const DE = 'áàäâãéèëêíìïîóòöôõúùüûñç';
const A = 'aaaaaeeeeiiiiooooouuuunc';

/** Igual que pm_sin_tildes() de la base: minúsculas y sin tildes, una letra por una letra. */
export function sinTildes(t: string): string {
  let r = '';
  for (const c of t.toLowerCase()) {
    const i = DE.indexOf(c);
    r += i >= 0 ? A[i] : c;
  }
  return r;
}

/** Palabras de la búsqueda, normalizadas; solo letras y números (nada llega crudo a to_tsquery). */
export function terminos(q: string): string[] {
  const palabras = sinTildes(q).match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(palabras)].slice(0, 6);
}

/** "dise pla" → "dise:* & pla:*" (cada palabra como prefijo: encuentra mientras se escribe). */
export const consultaTs = (ts: string[]) => ts.map((t) => `${t}:*`).join(' & ');

export type Marcas = [number, number][];

/** Dónde aparece cada término como inicio de palabra (posiciones sobre el texto original). */
export function marcar(texto: string, ts: string[]): Marcas {
  // toLowerCase puede cambiar el largo en casos raros (İ); si pasa, mejor no marcar que marcar mal.
  const norm = sinTildes(texto);
  if (norm.length !== texto.length) return [];
  const marcas: Marcas = [];
  for (const t of ts) {
    let i = norm.indexOf(t);
    while (i >= 0) {
      const inicioDePalabra = i === 0 || !/[\p{L}\p{N}]/u.test(norm[i - 1]);
      if (inicioDePalabra) marcas.push([i, i + t.length]);
      i = norm.indexOf(t, i + t.length);
    }
  }
  marcas.sort((a, b) => a[0] - b[0]);
  // Juntar las que se pisan.
  const juntas: Marcas = [];
  for (const m of marcas) {
    const u = juntas.at(-1);
    if (u && m[0] <= u[1]) u[1] = Math.max(u[1], m[1]);
    else juntas.push([...m]);
  }
  return juntas;
}

/** Un pedazo del texto alrededor de la primera coincidencia, con sus marcas ajustadas. */
export function fragmento(texto: string, ts: string[], largo = 180): { texto: string; marcas: Marcas } | null {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (!limpio) return null;
  const todas = marcar(limpio, ts);
  const primera = todas[0]?.[0] ?? 0;
  let desde = Math.max(0, primera - 60);
  if (desde > 0) {
    const espacio = limpio.indexOf(' ', desde);
    if (espacio >= 0 && espacio < primera) desde = espacio + 1;
  }
  let hasta = Math.min(limpio.length, desde + largo);
  if (hasta < limpio.length) {
    const espacio = limpio.lastIndexOf(' ', hasta);
    if (espacio > desde + 40) hasta = espacio;
  }
  const pre = desde > 0 ? '… ' : '';
  const corte = limpio.slice(desde, hasta);
  return {
    texto: pre + corte + (hasta < limpio.length ? ' …' : ''),
    marcas: todas
      .filter(([a, b]) => a >= desde && b <= hasta)
      .map(([a, b]) => [a - desde + pre.length, b - desde + pre.length] as [number, number]),
  };
}
