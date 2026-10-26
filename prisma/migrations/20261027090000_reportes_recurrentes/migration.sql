-- AlterTable
ALTER TABLE "list_templates" ADD COLUMN     "folderPath" TEXT,
ADD COLUMN     "folderVisibleToClients" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "listTitle" TEXT;

-- CreateTable
CREATE TABLE "template_recurrences" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "responsableId" TEXT,
    "createdById" TEXT NOT NULL,
    "nextRunOn" DATE NOT NULL,
    "lastRunOn" DATE,
    "lastError" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_recurrences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "template_recurrences_accountId_active_nextRunOn_idx" ON "template_recurrences"("accountId", "active", "nextRunOn");

-- CreateIndex
CREATE INDEX "template_recurrences_projectId_idx" ON "template_recurrences"("projectId");

-- AddForeignKey
ALTER TABLE "template_recurrences" ADD CONSTRAINT "template_recurrences_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_recurrences" ADD CONSTRAINT "template_recurrences_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_recurrences" ADD CONSTRAINT "template_recurrences_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "list_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (mismo patrón que el resto de las tablas de cuenta)
ALTER TABLE "template_recurrences" ENABLE ROW LEVEL SECURITY;
CREATE POLICY cuenta ON "template_recurrences" USING ("accountId" = app_account_id()) WITH CHECK ("accountId" = app_account_id());
