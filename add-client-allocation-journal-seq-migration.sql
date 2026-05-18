-- Client Allocation QuickBooks journal export sequence (SystemSettings)
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "clientAllocationJournalSeq" INTEGER NOT NULL DEFAULT 0;
