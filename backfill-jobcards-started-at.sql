-- Backfill startedAt for legacy job cards.
-- Prefer the earliest operational timestamp available.
-- Idempotent and safe to run repeatedly.
UPDATE "JobCard"
SET "startedAt" = LEAST(
  COALESCE("timeOfDeparture", 'infinity'::timestamp),
  COALESCE("timeOfArrival", 'infinity'::timestamp),
  COALESCE("submittedAt", 'infinity'::timestamp),
  COALESCE("completedAt", 'infinity'::timestamp),
  "createdAt"
)
WHERE "startedAt" IS NULL
   OR "startedAt" = "createdAt";
