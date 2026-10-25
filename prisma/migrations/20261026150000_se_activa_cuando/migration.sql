-- AlterTable
ALTER TABLE "list_template_items" ADD COLUMN     "waitsFor" INTEGER;

-- AlterTable
ALTER TABLE "todo_details" ADD COLUMN     "dueAfterDays" INTEGER,
ADD COLUMN     "pendingAssigneeIds" JSONB,
ADD COLUMN     "waitsForId" TEXT;

-- CreateIndex
CREATE INDEX "todo_details_waitsForId_idx" ON "todo_details"("waitsForId");

