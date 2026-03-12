-- One-time migration: ensure Client.engagementStage and Client.aidaStatus exist
-- (Production DB may have had status/stage dropped without these columns added.)
-- Safe to run multiple times (IF NOT EXISTS / DO blocks).

-- Client table
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "engagementStage" TEXT;
UPDATE "Client" SET "engagementStage" = 'Potential' WHERE "engagementStage" IS NULL;
ALTER TABLE "Client" ALTER COLUMN "engagementStage" SET DEFAULT 'Potential';
ALTER TABLE "Client" ALTER COLUMN "engagementStage" SET NOT NULL;

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "aidaStatus" TEXT;
UPDATE "Client" SET "aidaStatus" = 'Awareness' WHERE "aidaStatus" IS NULL;
ALTER TABLE "Client" ALTER COLUMN "aidaStatus" SET DEFAULT 'Awareness';
ALTER TABLE "Client" ALTER COLUMN "aidaStatus" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "Client_engagementStage_idx" ON "Client"("engagementStage");

-- ClientSite table (nullable columns)
ALTER TABLE "ClientSite" ADD COLUMN IF NOT EXISTS "engagementStage" TEXT;
ALTER TABLE "ClientSite" ALTER COLUMN "engagementStage" SET DEFAULT 'Potential';

ALTER TABLE "ClientSite" ADD COLUMN IF NOT EXISTS "aidaStatus" TEXT;
ALTER TABLE "ClientSite" ALTER COLUMN "aidaStatus" SET DEFAULT '';

-- Opportunity table
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "aidaStatus" TEXT;
UPDATE "Opportunity" SET "aidaStatus" = 'Awareness' WHERE "aidaStatus" IS NULL;
ALTER TABLE "Opportunity" ALTER COLUMN "aidaStatus" SET DEFAULT 'Awareness';
ALTER TABLE "Opportunity" ALTER COLUMN "aidaStatus" SET NOT NULL;

ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "engagementStage" TEXT;
UPDATE "Opportunity" SET "engagementStage" = 'Potential' WHERE "engagementStage" IS NULL;
ALTER TABLE "Opportunity" ALTER COLUMN "engagementStage" SET DEFAULT 'Potential';
ALTER TABLE "Opportunity" ALTER COLUMN "engagementStage" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "Opportunity_engagementStage_idx" ON "Opportunity"("engagementStage");
