-- CreateEnum
CREATE TYPE "TemplateAudience" AS ENUM ('team', 'client', 'any');

-- CreateTable
CREATE TABLE "list_templates" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "list_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "list_template_items" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "audience" "TemplateAudience" NOT NULL DEFAULT 'team',
    "dayOffset" INTEGER,
    "position" INTEGER NOT NULL,

    CONSTRAINT "list_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "list_templates_accountId_idx" ON "list_templates"("accountId");

-- CreateIndex
CREATE INDEX "list_template_items_templateId_position_idx" ON "list_template_items"("templateId", "position");

-- AddForeignKey
ALTER TABLE "list_templates" ADD CONSTRAINT "list_templates_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_template_items" ADD CONSTRAINT "list_template_items_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "list_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Plantillas (D-64): con RLS por cuenta, como el resto.
ALTER TABLE "list_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY cuenta ON "list_templates" USING ("accountId" = app_account_id()) WITH CHECK ("accountId" = app_account_id());
ALTER TABLE "list_template_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY cuenta ON "list_template_items" USING ("accountId" = app_account_id()) WITH CHECK ("accountId" = app_account_id());
