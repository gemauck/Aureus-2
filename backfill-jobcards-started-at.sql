-- Backfill startedAt for legacy job cards.
-- Idempotent: only updates rows where startedAt is NULL.
UPDATE "JobCard"
SET "startedAt" = "createdAt"
WHERE "startedAt" IS NULL;
