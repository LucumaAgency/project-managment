-- AlterTable
ALTER TABLE "todo_details" ADD COLUMN     "columnId" TEXT,
ADD COLUMN     "steps" JSONB;

-- CreateTable
CREATE TABLE "list_boards" (
    "recordingId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "columns" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "list_boards_pkey" PRIMARY KEY ("recordingId")
);

-- CreateIndex
CREATE INDEX "list_boards_accountId_idx" ON "list_boards"("accountId");

-- AddForeignKey
ALTER TABLE "list_boards" ADD CONSTRAINT "list_boards_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Tableros (D-68): con RLS por cuenta, como el resto.
ALTER TABLE "list_boards" ENABLE ROW LEVEL SECURITY;
CREATE POLICY cuenta ON "list_boards" USING ("accountId" = app_account_id()) WITH CHECK ("accountId" = app_account_id());
