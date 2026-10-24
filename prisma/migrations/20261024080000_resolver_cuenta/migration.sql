-- Dos huecos controlados en RLS, para lo que pasa ANTES de saber la cuenta.
--
-- `accounts` solo deja ver la cuenta fijada en la transacción. Pero para fijarla primero hay
-- que traducir el subdominio (slug) a un id, y para el selector de cuenta tras el login hay
-- que listar las cuentas de una persona con su nombre. Estas funciones hacen solo eso:
-- SECURITY DEFINER (corren como pm_admin, dueño), devuelven columnas mínimas y nada más.
-- pm_app puede ejecutarlas; nadie más.

CREATE FUNCTION cuenta_por_slug(p_slug text)
RETURNS TABLE (id text, slug text, name text, plan text, "timeZone" text, locale text, cerrada boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.slug, a.name, a.plan, a."timeZone", a.locale, a."closedAt" IS NOT NULL
  FROM accounts a
  WHERE a.slug = lower(p_slug)
$$;

-- Cuentas activas de la persona fijada en app.user_id, con su rol. Sin app.user_id: vacío.
CREATE FUNCTION cuentas_de_usuario()
RETURNS TABLE (id text, slug text, name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.slug, a.name, m.role::text
  FROM memberships m
  JOIN accounts a ON a.id = m."accountId"
  WHERE m."userId" = app_user_id()
    AND m.status = 'active'
    AND a."closedAt" IS NULL
  ORDER BY a.name
$$;

REVOKE ALL ON FUNCTION cuenta_por_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cuentas_de_usuario() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cuenta_por_slug(text) TO pm_app;
GRANT EXECUTE ON FUNCTION cuentas_de_usuario() TO pm_app;
