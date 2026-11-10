-- D-82: documentos en Markdown dentro de Archivos. Un tipo nuevo de elemento; el texto va en
-- "bodyText" (fuente, y ya alimenta la búsqueda) y el HTML armado en "bodyHtml". Sin columnas nuevas.
-- PostgreSQL 12+ admite ADD VALUE dentro de la transacción de la migración (no se usa el valor en ella).
ALTER TYPE "RecordingType" ADD VALUE IF NOT EXISTS 'doc';
