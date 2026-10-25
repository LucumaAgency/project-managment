-- Permisos de pm_app después de restaurar un respaldo traído de OTRO servidor (la mudanza
-- desde Plesk, documentacion/15-SERVIDOR-VULTR.md §5).
--
-- El respaldo de Plesk nombra los roles como carlosm_pm_admin / carlosm_pm_app. Se restaura con
-- --no-owner --no-privileges (todo queda de pm_admin y sin permisos), y esto vuelve a dar a
-- pm_app exactamente lo que le dan las migraciones, ni más ni menos.
--
-- Correr como pm_admin (los privilegios por defecto valen para lo que cree quien los fija):
--   psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -f deploy/vultr/permisos-app.sql
-- Después: base:verificar:prod tiene que decir "Todo en orden".

GRANT USAGE ON SCHEMA public TO pm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pm_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pm_app;
REVOKE ALL ON TABLE _prisma_migrations FROM pm_app;

-- Funciones SECURITY DEFINER: solo pm_app las ejecuta (migraciones resolver_cuenta,
-- invitaciones_soporte y claves_api). Si una migración nueva agrega otra, sumarla aquí.
REVOKE ALL ON FUNCTION cuenta_por_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cuentas_de_usuario() FROM PUBLIC;
REVOKE ALL ON FUNCTION invitacion_por_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cuentas_para_soporte() FROM PUBLIC;
REVOKE ALL ON FUNCTION api_key_por_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cuenta_por_slug(text) TO pm_app;
GRANT EXECUTE ON FUNCTION cuentas_de_usuario() TO pm_app;
GRANT EXECUTE ON FUNCTION invitacion_por_token(text) TO pm_app;
GRANT EXECUTE ON FUNCTION cuentas_para_soporte() TO pm_app;
GRANT EXECUTE ON FUNCTION api_key_por_hash(text) TO pm_app;
