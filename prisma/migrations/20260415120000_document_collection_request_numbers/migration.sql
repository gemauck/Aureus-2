-- Document collection: request numbers, persisted To/CC, unmatched inbound quarantine
ALTER TABLE "DocumentRequestEmailSent" ADD COLUMN IF NOT EXISTS "requestNumber" TEXT;
ALTER TABLE "DocumentRequestEmailSent" ADD COLUMN IF NOT EXISTS "toEmails" TEXT DEFAULT '[]';
ALTER TABLE "DocumentRequestEmailSent" ADD COLUMN IF NOT EXISTS "ccEmails" TEXT DEFAULT '[]';
CREATE INDEX IF NOT EXISTS "DocumentRequestEmailSent_requestNumber_idx" ON "DocumentRequestEmailSent"("requestNumber");

ALTER TABLE "DocumentCollectionEmailLog" ADD COLUMN IF NOT EXISTS "requestNumber" TEXT;
ALTER TABLE "DocumentCollectionEmailLog" ADD COLUMN IF NOT EXISTS "toEmails" TEXT DEFAULT '[]';
ALTER TABLE "DocumentCollectionEmailLog" ADD COLUMN IF NOT EXISTS "ccEmails" TEXT DEFAULT '[]';
CREATE INDEX IF NOT EXISTS "DocumentCollectionEmailLog_requestNumber_idx" ON "DocumentCollectionEmailLog"("requestNumber");

CREATE TABLE IF NOT EXISTS "DocumentRequestInboundUnmatched" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "fromAddress" TEXT,
    "subject" TEXT,
    "candidatesJson" TEXT,
    "reason" TEXT DEFAULT 'no_match',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentRequestInboundUnmatched_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentRequestInboundUnmatched_emailId_key" ON "DocumentRequestInboundUnmatched"("emailId");
CREATE INDEX IF NOT EXISTS "DocumentRequestInboundUnmatched_createdAt_idx" ON "DocumentRequestInboundUnmatched"("createdAt");
