-- CreateEnum
CREATE TYPE "AccountRole" AS ENUM ('owner', 'admin', 'member', 'client');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'archived', 'trashed');

-- CreateEnum
CREATE TYPE "RecordingType" AS ENUM ('todolist', 'todo', 'message', 'folder', 'upload', 'comment');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('active', 'archived', 'trashed');

-- CreateEnum
CREATE TYPE "BlobStatus" AS ENUM ('pending', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "NotificationReason" AS ENUM ('mentioned', 'assigned', 'subscribed', 'due_soon');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('pending', 'running', 'done', 'failed');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'interno',
    "limits" JSONB,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Lima',
    "locale" TEXT NOT NULL DEFAULT 'es',
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "passwordChangedAt" TIMESTAMP(3),
    "timeZone" TEXT,
    "locale" TEXT,
    "avatarBlobKey" TEXT,
    "isStaff" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AccountRole" NOT NULL DEFAULT 'member',
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "company" TEXT,
    "prefs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "AccountRole" NOT NULL DEFAULT 'member',
    "projectId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'active',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "trashedAt" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordings" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "RecordingType" NOT NULL,
    "parentId" TEXT,
    "creatorId" TEXT NOT NULL,
    "title" TEXT,
    "body" JSONB,
    "bodyHtml" TEXT,
    "bodyText" TEXT,
    "visibleToClients" BOOLEAN NOT NULL DEFAULT false,
    "status" "RecordingStatus" NOT NULL DEFAULT 'active',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trashedAt" TIMESTAMP(3),
    "trashedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "search" tsvector,

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todo_details" (
    "recordingId" TEXT NOT NULL,
    "dueOn" DATE,
    "startsOn" DATE,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,

    CONSTRAINT "todo_details_pkey" PRIMARY KEY ("recordingId")
);

-- CreateTable
CREATE TABLE "todo_assignees" (
    "recordingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "todo_assignees_pkey" PRIMARY KEY ("recordingId","userId")
);

-- CreateTable
CREATE TABLE "blobs" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "checksum" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "previewKey" TEXT,
    "status" "BlobStatus" NOT NULL DEFAULT 'pending',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_versions" (
    "id" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "blobId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recording_attachments" (
    "recordingId" TEXT NOT NULL,
    "blobId" TEXT NOT NULL,

    CONSTRAINT "recording_attachments_pkey" PRIMARY KEY ("recordingId","blobId")
);

-- CreateTable
CREATE TABLE "mentions" (
    "recordingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentions_pkey" PRIMARY KEY ("recordingId","userId")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "recordingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("recordingId","userId")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "recordingId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "visibleToClients" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT,
    "recordingId" TEXT,
    "reason" "NotificationReason" NOT NULL,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "accountId" TEXT,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 6,
    "lastError" TEXT,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_slug_key" ON "accounts"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_accountId_userId_key" ON "memberships"("accountId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "invitations_accountId_email_idx" ON "invitations"("accountId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "login_tokens_tokenHash_key" ON "login_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "login_tokens_userId_idx" ON "login_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "projects_accountId_status_idx" ON "projects"("accountId", "status");

-- CreateIndex
CREATE INDEX "project_members_accountId_userId_idx" ON "project_members"("accountId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_projectId_userId_key" ON "project_members"("projectId", "userId");

-- CreateIndex
CREATE INDEX "recordings_projectId_type_status_idx" ON "recordings"("projectId", "type", "status");

-- CreateIndex
CREATE INDEX "recordings_parentId_position_idx" ON "recordings"("parentId", "position");

-- CreateIndex
CREATE INDEX "recordings_accountId_status_trashedAt_idx" ON "recordings"("accountId", "status", "trashedAt");

-- CreateIndex
CREATE INDEX "recordings_search_idx" ON "recordings" USING GIN ("search");

-- CreateIndex
CREATE INDEX "todo_details_dueOn_idx" ON "todo_details"("dueOn");

-- CreateIndex
CREATE INDEX "todo_assignees_accountId_userId_idx" ON "todo_assignees"("accountId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "blobs_storageKey_key" ON "blobs"("storageKey");

-- CreateIndex
CREATE INDEX "blobs_accountId_status_idx" ON "blobs"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "upload_versions_recordingId_version_key" ON "upload_versions"("recordingId", "version");

-- CreateIndex
CREATE INDEX "subscriptions_accountId_userId_idx" ON "subscriptions"("accountId", "userId");

-- CreateIndex
CREATE INDEX "events_projectId_createdAt_idx" ON "events"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "events_accountId_createdAt_idx" ON "events"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_accountId_readAt_idx" ON "notifications"("userId", "accountId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_emailedAt_createdAt_idx" ON "notifications"("emailedAt", "createdAt");

-- CreateIndex
CREATE INDEX "jobs_status_runAt_idx" ON "jobs"("status", "runAt");

-- CreateIndex
CREATE INDEX "audit_log_accountId_createdAt_idx" ON "audit_log"("accountId", "createdAt");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_trashedById_fkey" FOREIGN KEY ("trashedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_details" ADD CONSTRAINT "todo_details_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_details" ADD CONSTRAINT "todo_details_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_assignees" ADD CONSTRAINT "todo_assignees_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_assignees" ADD CONSTRAINT "todo_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blobs" ADD CONSTRAINT "blobs_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_versions" ADD CONSTRAINT "upload_versions_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_versions" ADD CONSTRAINT "upload_versions_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "blobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_versions" ADD CONSTRAINT "upload_versions_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_attachments" ADD CONSTRAINT "recording_attachments_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_attachments" ADD CONSTRAINT "recording_attachments_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "blobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
