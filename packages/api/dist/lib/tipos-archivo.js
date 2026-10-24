/**
 * Tipo real de un archivo, mirando sus primeros bytes (no lo que dice el navegador ni la
 * extensión, que se pueden falsear). Solo imágenes comunes y PDF se muestran dentro de la app;
 * todo lo demás se descarga. Nunca se muestra HTML ni SVG en línea: podrían ejecutar código.
 */
const FIRMAS = [
    { tipo: 'application/pdf', es: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
    { tipo: 'image/png', es: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    { tipo: 'image/jpeg', es: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { tipo: 'image/gif', es: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')) },
    { tipo: 'image/webp', es: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];
/** Para descargar: tipo por extensión (solo informativo, se sirve como adjunto). */
const POR_EXTENSION = {
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip',
    txt: 'text/plain',
    csv: 'text/csv',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    ai: 'application/postscript',
    psd: 'image/vnd.adobe.photoshop',
    svg: 'image/svg+xml',
};
export function tipoReal(cabecera, nombre) {
    const firma = FIRMAS.find((f) => f.es(cabecera));
    if (firma)
        return firma.tipo;
    const ext = nombre.split('.').pop()?.toLowerCase() ?? '';
    return POR_EXTENSION[ext] ?? 'application/octet-stream';
}
/** Solo lo reconocido por su firma se puede ver dentro de la app. */
export const seMuestraEnLinea = (tipo) => FIRMAS.some((f) => f.tipo === tipo);
/** Nombre de archivo limpio: sin rutas, sin caracteres de control, de largo razonable. */
export function nombreLimpio(crudo) {
    const base = crudo.split(/[\\/]/).pop() ?? '';
    const limpio = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
    return limpio && limpio !== '.' && limpio !== '..' ? limpio : 'archivo';
}
