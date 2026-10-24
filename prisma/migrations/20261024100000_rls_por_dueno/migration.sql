-- RLS sin FORCE: el aislamiento se apoya en que pm_app NO es dueño de las tablas.
--
-- Hasta aquí pm_admin saltaba RLS con el atributo BYPASSRLS, y las tablas tenían FORCE ROW
-- LEVEL SECURITY (RLS también para el dueño). BYPASSRLS solo lo da un superusuario, y en
-- Plesk no hay acceso de superusuario (D-44). Postgres ya resuelve esto de fábrica: el DUEÑO
-- de una tabla no está sujeto a sus políticas salvo que la tabla tenga FORCE. Entonces:
--
--   pm_admin (corre las migraciones, por eso es dueño de todo) → ve todo por ser dueño.
--   pm_app   (la API; no es dueño ni miembro de pm_admin)     → sujeto a RLS siempre.
--
-- Para pm_app no cambia nada: las mismas políticas, ENABLE sigue activo. El test de
-- aislamiento comprueba además que pm_app no sea dueño de ninguna tabla ni miembro de
-- pm_admin (si lo fuera, heredaría el salto de RLS del dueño).
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
