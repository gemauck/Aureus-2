-- Collaborative stock-take: session revision + participants (web + Job Cards)
ALTER TABLE "StockTakeSubmission" ADD COLUMN IF NOT EXISTS "sessionRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "StockTakeParticipant" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'member',
    "invitedById" TEXT NOT NULL DEFAULT '',
    "invitedByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTakeParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StockTakeParticipant_submissionId_userId_key" ON "StockTakeParticipant"("submissionId", "userId");
CREATE INDEX IF NOT EXISTS "StockTakeParticipant_userId_idx" ON "StockTakeParticipant"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StockTakeParticipant_submissionId_fkey'
  ) THEN
    ALTER TABLE "StockTakeParticipant" ADD CONSTRAINT "StockTakeParticipant_submissionId_fkey"
      FOREIGN KEY ("submissionId") REFERENCES "StockTakeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
