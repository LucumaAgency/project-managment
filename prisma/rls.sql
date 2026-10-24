-- Lucuma Proyectos — aislamiento por cuenta (Row Level Security) + búsqueda.
-- Va como migración SQL manual DESPUÉS de la migración inicial de Prisma:
--   npx prisma migrate dev --create-only --name rls   → pegar este archivo → migrate dev
--
-- Cómo funciona: la API abre cada petición en una transacción y ejecuta
--   SELECT set_config('app.account_id', '<id>', true), set_config('app.user_id', '<id>', true);
-- Postgres solo deja ver/escribir filas de esa cuenta. Si el código olvida un
-- `where: { accountId }`, la consulta devuelve vacío en vez de datos de otra agencia.
--
-- Dos roles de base de datos:
--   app       → lo usa la API. Sujeto a RLS.
--   app_admin → migraciones, worker de jobs que recorren varias cuentas (resumen diario,
--               purgas) y panel de superadmin. BYPASSRLS. Nunca atiende peticiones de usuarios.

-- ---------------------------------------------------------------- roles
-- (crear una vez en el servidor, con contraseñas reales)
-- CREATE ROLE app LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS;
-- CREATE ROLE app_admin LOGIN PASSWORD '...' NOSUPERUSER BYPASSRLS;
-- GRANT USAGE ON SCHEMA public TO app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;

-- ------------------------------------------------------- funciones de contexto
CREATE OR REPLACE FUNCTION app_account_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.account_id', true), '') $$;

CREATE OR REPLACE FUNCTION app_user_id() RETURNS text
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
-- (para el selector "¿a qué cuenta entras?" después del login). Escribir solo en la activa.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY leer ON memberships FOR SELECT
  USING ("accountId" = app_account_id() OR "userId" = app_user_id());
CREATE POLICY escribir ON memberships FOR ALL
  USING ("accountId" = app_account_id()) WITH CHECK ("accountId" = app_account_id());

-- audit_log: accountId puede ser null (login, intentos fallidos): esos solo los ve app_admin.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY cuenta ON audit_log USING ("accountId" = app_account_id())
  WITH CHECK ("accountId" IS NULL OR "accountId" = app_account_id());

-- ------------------------------ tablas de detalle sin accountId: heredan del recording
-- (el subquery ya pasa por la política de recordings)
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
-- 'simple' y no 'spanish': el contenido mezcla ES/EN y nombres propios; no conviene recortar raíces.
ALTER TABLE recordings DROP COLUMN IF EXISTS search;
ALTER TABLE recordings ADD COLUMN search tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce("bodyText", '')), 'B')
) STORED;
CREATE INDEX recordings_search_idx ON recordings USING GIN (search);
