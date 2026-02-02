-- Add safetyCultureAuditId to JobCard for Safety Culture import deduplication
ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "safetyCultureAuditId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "JobCard_safetyCultureAuditId_key" ON "JobCard"("safetyCultureAuditId") WHERE "safetyCultureAuditId" IS NOT NULL;
