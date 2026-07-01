-- Project correspondence module (idempotent)
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "hasCorrespondenceProcess" BOOLEAN DEFAULT false;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "correspondenceInboundEmail" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "correspondenceInboxSlug" TEXT;

CREATE TABLE IF NOT EXISTS "ProjectCorrespondenceThread" (
  id TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  "requestNumber" TEXT,
  "correspondenceType" TEXT NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'open',
  counterparty TEXT,
  "externalReference" TEXT,
  summary TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ProjectCorrespondenceEntry" (
  id TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'manual',
  direction TEXT NOT NULL DEFAULT 'internal',
  "correspondenceType" TEXT NOT NULL DEFAULT 'other',
  subject TEXT NOT NULL DEFAULT '',
  "bodyText" TEXT NOT NULL DEFAULT '',
  "bodyHtml" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "authorId" TEXT,
  "fromEmail" TEXT,
  "toEmails" TEXT NOT NULL DEFAULT '[]',
  "ccEmails" TEXT NOT NULL DEFAULT '[]',
  "contactName" TEXT,
  "contactOrganization" TEXT,
  "contactPhone" TEXT,
  "externalReference" TEXT,
  "actionRequired" TEXT,
  "followUpDate" TIMESTAMP(3),
  location TEXT,
  "durationMinutes" INTEGER,
  outcome TEXT,
  confidentiality TEXT NOT NULL DEFAULT 'standard',
  "messageId" TEXT,
  "deliveryStatus" TEXT NOT NULL DEFAULT 'sent',
  "deliveredAt" TIMESTAMP(3),
  "bouncedAt" TIMESTAMP(3),
  "bounceReason" TEXT,
  "lastEventAt" TIMESTAMP(3),
  attachments TEXT NOT NULL DEFAULT '[]',
  "emailArchivePath" TEXT,
  "rawEmailPath" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ProjectCorrespondenceInboundUnmatched" (
  id TEXT PRIMARY KEY,
  "emailId" TEXT NOT NULL UNIQUE,
  "fromAddress" TEXT,
  subject TEXT,
  "candidatesJson" TEXT,
  reason TEXT DEFAULT 'no_match',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "ProjectCorrespondenceThread" ADD COLUMN IF NOT EXISTS "correspondenceType" TEXT NOT NULL DEFAULT 'other';
ALTER TABLE "ProjectCorrespondenceThread" ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE "ProjectCorrespondenceThread" ADD COLUMN IF NOT EXISTS counterparty TEXT;
ALTER TABLE "ProjectCorrespondenceThread" ADD COLUMN IF NOT EXISTS "externalReference" TEXT;
ALTER TABLE "ProjectCorrespondenceThread" ADD COLUMN IF NOT EXISTS summary TEXT;

ALTER TABLE "ProjectCorrespondenceEntry" ADD COLUMN IF NOT EXISTS "correspondenceType" TEXT NOT NULL DEFAULT 'other';
ALTER TABLE "ProjectCorrespondenceEntry" ADD COLUMN IF NOT EXISTS "contactName" TEXT;
ALTER TABLE "ProjectCorrespondenceEntry" ADD COLUMN IF NOT EXISTS "contactOrganization" TEXT;
ALTER TABLE "ProjectCorrespondenceEntry" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
ALTER TABLE "ProjectCorrespondenceEntry" ADD COLUMN IF NOT EXISTS "externalReference" TEXT;
ALTER TABLE "ProjectCorrespondenceEntry" ADD COLUMN IF NOT EXISTS "actionRequired" TEXT;
ALTER TABLE "ProjectCorrespondenceEntry" ADD COLUMN IF NOT EXISTS "followUpDate" TIMESTAMP(3);
ALTER TABLE "ProjectCorrespondenceEntry" ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE "ProjectCorrespondenceEntry" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER;
ALTER TABLE "ProjectCorrespondenceEntry" ADD COLUMN IF NOT EXISTS outcome TEXT;
ALTER TABLE "ProjectCorrespondenceEntry" ADD COLUMN IF NOT EXISTS confidentiality TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE "ProjectCorrespondenceEntry" ADD COLUMN IF NOT EXISTS "emailArchivePath" TEXT;
ALTER TABLE "ProjectCorrespondenceEntry" ADD COLUMN IF NOT EXISTS "rawEmailPath" TEXT;

CREATE INDEX IF NOT EXISTS "ProjectCorrespondenceThread_projectId_idx" ON "ProjectCorrespondenceThread" ("projectId");
CREATE INDEX IF NOT EXISTS "ProjectCorrespondenceThread_requestNumber_idx" ON "ProjectCorrespondenceThread" ("requestNumber");
CREATE INDEX IF NOT EXISTS "ProjectCorrespondenceEntry_threadId_idx" ON "ProjectCorrespondenceEntry" ("threadId");
CREATE INDEX IF NOT EXISTS "ProjectCorrespondenceEntry_projectId_idx" ON "ProjectCorrespondenceEntry" ("projectId");
CREATE INDEX IF NOT EXISTS "ProjectCorrespondenceEntry_messageId_idx" ON "ProjectCorrespondenceEntry" ("messageId");
