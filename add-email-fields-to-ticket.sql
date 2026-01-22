-- Add email integration fields to Ticket table
-- Run this when database connections are available

ALTER TABLE "Ticket" 
ADD COLUMN IF NOT EXISTS "sourceEmail" TEXT,
ADD COLUMN IF NOT EXISTS "emailThreadId" TEXT,
ADD COLUMN IF NOT EXISTS "emailMessageId" TEXT,
ADD COLUMN IF NOT EXISTS "emailSubject" TEXT;

-- Add indexes for email lookups
CREATE INDEX IF NOT EXISTS "Ticket_emailThreadId_idx" ON "Ticket"("emailThreadId");
CREATE INDEX IF NOT EXISTS "Ticket_emailMessageId_idx" ON "Ticket"("emailMessageId");
CREATE INDEX IF NOT EXISTS "Ticket_sourceEmail_idx" ON "Ticket"("sourceEmail");















