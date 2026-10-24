-- Dos huecos controlados más en RLS (mismo criterio que `resolver_cuenta`).
--
-- 1. invitacion_por_token: quien abre un enlace de invitación todavía no tiene cuenta fijada
--    (ni sesión, muchas veces). La función busca por el HASH del token y devuelve solo lo que
--    la pantalla de aceptar necesita. Sin el token no hay forma de listar invitaciones.
--
-- 2. cuentas_para_soporte: el personal de soporte de Lucuma (users.isStaff) ve la lista de
--    cuentas abiertas para poder entrar durante la beta. Si app.user_id no es staff: vacío.
--    Que el acceso de soporte esté activo lo decide la API (SOPORTE_BETA); esto solo lista.

CREATE FUNCTION invitacion_por_token(p_hash text)
RETURNS TABLE (
  id text, "accountId" text, "cuentaSlug" text, "cuentaNombre" text, "cuentaCerrada" boolean,
  email text, role text, "projectId" text, "proyectoNombre" text, "invitadoPor" text,
  "expiresAt" timestamp(3), "acceptedAt" timestamp(3)
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i."accountId", a.slug, a.name, a."closedAt" IS NOT NULL,
         i.email, i.role::text, i."projectId", p.name, u.name,
         i."expiresAt", i."acceptedAt"
  FROM invitations i
  JOIN accounts a ON a.id = i."accountId"
  LEFT JOIN projects p ON p.id = i."projectId" AND p."accountId" = i."accountId"
  LEFT JOIN users u ON u.id = i."invitedById"
  WHERE i."tokenHash" = p_hash
$$;

CREATE FUNCTION cuentas_para_soporte()
RETURNS TABLE (id text, slug text, name text, plan text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.slug, a.name, a.plan
  FROM accounts a
  WHERE a."closedAt" IS NULL
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = app_user_id() AND u."isStaff")
  ORDER BY a.name
$$;

REVOKE ALL ON FUNCTION invitacion_por_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cuentas_para_soporte() FROM PUBLIC;
DO $$
DECLARE
  rol_app text := replace(current_user, 'pm_admin', 'pm_app');
BEGIN
  IF rol_app = current_user OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol_app) THEN
    RAISE EXCEPTION 'Las migraciones se corren con el usuario dueño (…pm_admin) y tiene que existir el usuario de la app (%). Ver documentacion/10-DESPLIEGUE-PLESK.md', rol_app;
  END IF;
  EXECUTE format('GRANT EXECUTE ON FUNCTION invitacion_por_token(text) TO %I', rol_app);
  EXECUTE format('GRANT EXECUTE ON FUNCTION cuentas_para_soporte() TO %I', rol_app);
END $$;
