-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isBot" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_accountId_idx" ON "api_keys"("accountId");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Claves de API (D-63): con RLS por cuenta, como el resto.
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
CREATE POLICY cuenta ON "api_keys" USING ("accountId" = app_account_id()) WITH CHECK ("accountId" = app_account_id());

-- Hueco controlado (mismo criterio que invitacion_por_token): al llegar una petición con
-- clave todavía no hay cuenta fijada. Busca por la HUELLA de la clave y devuelve lo justo
-- para armar el contexto. Sin la clave no hay forma de listar nada.
CREATE FUNCTION api_key_por_hash(p_hash text)
RETURNS TABLE (
  id text, "accountId" text, "userId" text, revocada boolean, "cuentaCerrada" boolean,
  "esBot" boolean, rol text, "miembroActivo" boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT k.id, k."accountId", k."userId", k."revokedAt" IS NOT NULL, a."closedAt" IS NOT NULL,
         u."isBot", m.role::text, coalesce(m.status = 'active', false)
  FROM api_keys k
  JOIN accounts a ON a.id = k."accountId"
  JOIN users u ON u.id = k."userId"
  LEFT JOIN memberships m ON m."accountId" = k."accountId" AND m."userId" = k."userId"
  WHERE k."keyHash" = p_hash
$$;

REVOKE ALL ON FUNCTION api_key_por_hash(text) FROM PUBLIC;
DO $$
DECLARE
  rol_app text := replace(current_user, 'pm_admin', 'pm_app');
BEGIN
  IF rol_app = current_user OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol_app) THEN
    RAISE EXCEPTION 'Las migraciones se corren con el usuario dueño (…pm_admin) y tiene que existir el usuario de la app (%). Ver documentacion/10-DESPLIEGUE-PLESK.md', rol_app;
  END IF;
  EXECUTE format('GRANT EXECUTE ON FUNCTION api_key_por_hash(text) TO %I', rol_app);
END $$;
