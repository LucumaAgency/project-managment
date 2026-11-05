-- D-78: enlaces en Archivos. Un tipo nuevo de elemento y su dirección.
-- PostgreSQL 12+ admite ADD VALUE dentro de la transacción de la migración (no se usa el valor en ella).
ALTER TYPE "RecordingType" ADD VALUE IF NOT EXISTS 'link';

-- AlterTable
ALTER TABLE "recordings" ADD COLUMN "url" TEXT;
