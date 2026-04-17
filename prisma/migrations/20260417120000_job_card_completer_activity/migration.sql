-- Job card completer snapshot + per-card activity trail
ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "completedByUserId" TEXT;
ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "completedByName" TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'JobCard_completedByUserId_fkey'
  ) THEN
    ALTER TABLE "JobCard"
      ADD CONSTRAINT "JobCard_completedByUserId_fkey"
      FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "JobCard_completedByUserId_idx" ON "JobCard"("completedByUserId");

CREATE TABLE IF NOT EXISTS "JobCardActivity" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'web',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobCardActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "JobCardActivity_jobCardId_idx" ON "JobCardActivity"("jobCardId");
CREATE INDEX IF NOT EXISTS "JobCardActivity_createdAt_idx" ON "JobCardActivity"("createdAt");
CREATE INDEX IF NOT EXISTS "JobCardActivity_actorUserId_idx" ON "JobCardActivity"("actorUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'JobCardActivity_jobCardId_fkey'
  ) THEN
    ALTER TABLE "JobCardActivity"
      ADD CONSTRAINT "JobCardActivity_jobCardId_fkey"
      FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'JobCardActivity_actorUserId_fkey'
  ) THEN
    ALTER TABLE "JobCardActivity"
      ADD CONSTRAINT "JobCardActivity_actorUserId_fkey"
      FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
