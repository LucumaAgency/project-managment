-- La búsqueda pasa de columna GENERATED a columna común llenada por trigger.
-- Motivo: Prisma lee la expresión generada como un DEFAULT y en cada migración futura
-- intentaría `ALTER COLUMN search DROP DEFAULT`, que falla sobre una columna generada.
-- Con trigger el resultado es el mismo y Prisma no ve diferencias con el schema.
-- `search` es derivado (title + bodyText): se recalcula al final, no se pierde nada.
DROP INDEX "recordings_search_idx";
ALTER TABLE recordings DROP COLUMN search;
ALTER TABLE recordings ADD COLUMN search tsvector;
CREATE INDEX "recordings_search_idx" ON recordings USING GIN (search);

CREATE FUNCTION recordings_search_actualizar() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.search :=
    setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW."bodyText", '')), 'B');
  RETURN NEW;
END $$;

CREATE TRIGGER recordings_search
  BEFORE INSERT OR UPDATE OF title, "bodyText" ON recordings
  FOR EACH ROW EXECUTE FUNCTION recordings_search_actualizar();

-- Recalcular las filas que ya existan.
UPDATE recordings SET title = title;
