-- AlterTable
ALTER TABLE "list_template_items" ADD COLUMN     "fields" JSONB;

-- AlterTable
ALTER TABLE "todo_details" ADD COLUMN     "fields" JSONB;

-- CreateTable
CREATE TABLE "task_answers" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "answeredById" TEXT NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_answers_accountId_idx" ON "task_answers"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "task_answers_recordingId_fieldId_key" ON "task_answers"("recordingId", "fieldId");

-- AddForeignKey
ALTER TABLE "task_answers" ADD CONSTRAINT "task_answers_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Respuestas (D-65): con RLS por cuenta, como el resto.
ALTER TABLE "task_answers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY cuenta ON "task_answers" USING ("accountId" = app_account_id()) WITH CHECK ("accountId" = app_account_id());
