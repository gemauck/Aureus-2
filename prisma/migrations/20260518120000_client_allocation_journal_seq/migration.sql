-- Client Allocation Report: QuickBooks journal export sequence on SystemSettings
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "clientAllocationJournalSeq" INTEGER NOT NULL DEFAULT 0;
