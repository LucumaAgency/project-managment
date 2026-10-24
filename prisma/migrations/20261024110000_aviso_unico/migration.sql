-- Recordatorios de tareas (día 12): una clave única por recordatorio, para que el latido
-- externo y el cálculo "al usar la app" puedan correr a la vez sin duplicar avisos.
ALTER TABLE "notifications" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");
