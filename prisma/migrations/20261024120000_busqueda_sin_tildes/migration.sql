-- Búsqueda sin tildes ni mayúsculas (día 14, D-57): "diseno" encuentra "Diseño".
-- Sin la extensión unaccent (en Plesk no hay root para instalarla): un translate() propio.
-- Cambia cada letra por UNA letra, así las posiciones del texto no se mueven (el resaltado
-- del lado de la app usa el mismo mapa, lib/busqueda.ts).
CREATE OR REPLACE FUNCTION pm_sin_tildes(t text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT translate(lower(t), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc')
$$;

CREATE OR REPLACE FUNCTION recordings_search_actualizar() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.search :=
    setweight(to_tsvector('simple', pm_sin_tildes(coalesce(NEW.title, ''))), 'A') ||
    setweight(to_tsvector('simple', pm_sin_tildes(coalesce(NEW."bodyText", ''))), 'B');
  RETURN NEW;
END $$;

-- Recalcular lo que ya existe (no cambia updatedAt: ese lo pone la app).
UPDATE recordings SET title = title;
