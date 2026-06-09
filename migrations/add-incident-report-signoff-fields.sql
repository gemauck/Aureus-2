-- Incident report sign-off and asset fields (idempotent).
ALTER TABLE "IncidentReport" ADD COLUMN IF NOT EXISTS "relevantAssets" TEXT NOT NULL DEFAULT '';
ALTER TABLE "IncidentReport" ADD COLUMN IF NOT EXISTS "relevantTanksMobileBowsers" TEXT NOT NULL DEFAULT '';
ALTER TABLE "IncidentReport" ADD COLUMN IF NOT EXISTS "technicianName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "IncidentReport" ADD COLUMN IF NOT EXISTS "authorName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "IncidentReport" ADD COLUMN IF NOT EXISTS "authorSignature" TEXT NOT NULL DEFAULT '';
