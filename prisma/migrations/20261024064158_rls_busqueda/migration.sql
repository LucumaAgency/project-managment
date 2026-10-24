-- Aislamiento por cuenta (Row Level Security), permisos del rol de la app y búsqueda.
-- Migración escrita a mano: Prisma no modela políticas ni columnas generadas.
--
-- Cómo funciona: la API abre cada petición en una transacción y ejecuta
--   SELECT set_config('app.account_id', '<id>', true), set_config('app.user_id', '<id>', true);
-- Postgres solo deja ver y escribir filas de esa cuenta. Si el código olvida un
-- `where: { accountId }`, la consulta devuelve vacío en vez de datos de otra agencia.
--
-- Roles (se crean ANTES de migrar; en local lo hace scripts/db-local.mjs, en el servidor
-- se crean a mano, ver docs/DESARROLLO.md):
--   pm_admin → dueño de las tablas, BYPASSRLS. Corre esta migración.
--   pm_app   → la API. Sujeto a RLS.

-- ------------------------------------------------------------ permisos de pm_app
-- El nombre real del rol de la app se deduce del que corre la migración: pm_admin → pm_app,
-- carlosm_pm_admin → carlosm_pm_app (Plesk antepone el usuario de la suscripción, D-45).
DO $$
DECLARE
  rol_app text := replace(current_user, 'pm_admin', 'pm_app');
BEGIN
  IF rol_app = current_user OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol_app) THEN
    RAISE EXCEPTION 'Las migraciones se corren con el usuario dueño (…pm_admin) y tiene que existir el usuario de la app (%). Ver documentacion/10-DESPLIEGUE-PLESK.md', rol_app;
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', rol_app);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', rol_app);
  -- Las tablas que creen migraciones futuras (las corre pm_admin) heredan el mismo permiso.
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', rol_app);
  -- La tabla de control de Prisma no es asunto de la app. (Condicional: en la base
  -- temporal que Prisma usa para comparar esquemas esa tabla no existe.)
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON TABLE _prisma_migrations FROM %I', rol_app);
  END IF;
END $$;

-- ------------------------------------------------------- funciones de contexto
CREATE FUNCTION app_account_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.account_id', true), '') $$;

CREATE FUNCTION app_user_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;

-- ------------------------------------------- tablas con accountId: política directa
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invitations', 'projects', 'project_members', 'recordings', 'todo_assignees',
    'blobs', 'mentions', 'subscriptions', 'events', 'notifications'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY cuenta ON %I USING ("accountId" = app_account_id()) '
      'WITH CHECK ("accountId" = app_account_id())', t);
  END LOOP;
END $$;

-- accounts: solo la cuenta activa.
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY cuenta ON accounts USING (id = app_account_id());

-- memberships: las de la cuenta activa, más las propias en cualquier cuenta
-- (selector "¿a qué cuenta entras?" después del login). Escribir solo en la activa.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY leer ON memberships FOR SELECT
  USING ("accountId" = app_account_id() OR "userId" = app_user_id());
CREATE POLICY insertar ON memberships FOR INSERT
  WITH CHECK ("accountId" = app_account_id());
CREATE POLICY actualizar ON memberships FOR UPDATE
  USING ("accountId" = app_account_id()) WITH CHECK ("accountId" = app_account_id());
CREATE POLICY borrar ON memberships FOR DELETE
  USING ("accountId" = app_account_id());

-- audit_log: accountId null (login, intentos fallidos) se puede escribir pero solo lo lee pm_admin.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY cuenta ON audit_log USING ("accountId" = app_account_id())
  WITH CHECK ("accountId" IS NULL OR "accountId" = app_account_id());

-- ------------------------------ tablas de detalle sin accountId: heredan del recording
-- (el subquery pasa por la política de recordings)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['todo_details', 'upload_versions', 'recording_attachments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY cuenta ON %I USING (EXISTS (SELECT 1 FROM recordings r WHERE r.id = "recordingId")) '
      'WITH CHECK (EXISTS (SELECT 1 FROM recordings r WHERE r.id = "recordingId"))', t);
  END LOOP;
END $$;

-- Sin RLS a propósito: users, login_tokens, sessions (el login ocurre antes de saber la
-- cuenta) y jobs (infraestructura; el worker fija app.account_id al ejecutar cada job).

-- ------------------------------------------------------------------- búsqueda
-- 'simple' y no 'spanish': el contenido mezcla ES/EN y nombres propios.
-- Prisma creó `search` como tsvector común con su índice GIN; se reemplaza por una
-- columna generada con el mismo nombre de índice, para que Prisma no vea diferencias.
DROP INDEX "recordings_search_idx";
ALTER TABLE recordings DROP COLUMN search;
ALTER TABLE recordings ADD COLUMN search tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce("bodyText", '')), 'B')
) STORED;
CREATE INDEX "recordings_search_idx" ON recordings USING GIN (search);
