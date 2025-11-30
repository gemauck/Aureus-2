-- Service & Maintenance Dynamic Forms / Checklists
-- This migration adds tables for reusable service form templates
-- and jobcard-specific form instances.

CREATE TABLE IF NOT EXISTS "ServiceFormTemplate" (
  "id"           VARCHAR(191) PRIMARY KEY,
  "name"         TEXT NOT NULL,
  "description"  TEXT NOT NULL DEFAULT '',
  "category"     TEXT NOT NULL DEFAULT 'General',
  "isActive"     BOOLEAN NOT NULL DEFAULT TRUE,
  "version"      INTEGER NOT NULL DEFAULT 1,
  "fields"       TEXT NOT NULL DEFAULT '[]',
  "createdById"  VARCHAR(191),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ServiceFormInstance" (
  "id"              VARCHAR(191) PRIMARY KEY,
  "jobCardId"       VARCHAR(191) NOT NULL,
  "templateId"      VARCHAR(191) NOT NULL,
  "templateName"    TEXT NOT NULL DEFAULT '',
  "templateVersion" INTEGER NOT NULL DEFAULT 1,
  "status"          TEXT NOT NULL DEFAULT 'not_started',
  "answers"         TEXT NOT NULL DEFAULT '[]',
  "completedAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Relations
ALTER TABLE "ServiceFormTemplate"
  ADD CONSTRAINT "ServiceFormTemplate_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "ServiceFormInstance"
  ADD CONSTRAINT "ServiceFormInstance_jobCardId_fkey"
  FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "ServiceFormInstance"
  ADD CONSTRAINT "ServiceFormInstance_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "ServiceFormTemplate"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- Indexes matching Prisma schema
CREATE INDEX IF NOT EXISTS "ServiceFormTemplate_category_idx" ON "ServiceFormTemplate"("category");
CREATE INDEX IF NOT EXISTS "ServiceFormTemplate_isActive_idx" ON "ServiceFormTemplate"("isActive");
CREATE INDEX IF NOT EXISTS "ServiceFormTemplate_createdById_idx" ON "ServiceFormTemplate"("createdById");

CREATE INDEX IF NOT EXISTS "ServiceFormInstance_jobCardId_idx" ON "ServiceFormInstance"("jobCardId");
CREATE INDEX IF NOT EXISTS "ServiceFormInstance_templateId_idx" ON "ServiceFormInstance"("templateId");
CREATE INDEX IF NOT EXISTS "ServiceFormInstance_status_idx" ON "ServiceFormInstance"("status");
CREATE INDEX IF NOT EXISTS "ServiceFormInstance_createdAt_idx" ON "ServiceFormInstance"("createdAt");



