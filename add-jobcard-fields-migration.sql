-- Add missing JobCard fields migration
-- This adds: actionsTaken, stockUsed, materialsBought, totalMaterialsCost

-- Add actionsTaken field
ALTER TABLE "JobCard" 
ADD COLUMN IF NOT EXISTS "actionsTaken" TEXT NOT NULL DEFAULT '';

-- Add stockUsed field (JSON array)
ALTER TABLE "JobCard" 
ADD COLUMN IF NOT EXISTS "stockUsed" TEXT NOT NULL DEFAULT '[]';

-- Add materialsBought field (JSON array)
ALTER TABLE "JobCard" 
ADD COLUMN IF NOT EXISTS "materialsBought" TEXT NOT NULL DEFAULT '[]';

-- Add totalMaterialsCost field
ALTER TABLE "JobCard" 
ADD COLUMN IF NOT EXISTS "totalMaterialsCost" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Update existing records to have empty arrays for JSON fields
UPDATE "JobCard" 
SET "stockUsed" = '[]' 
WHERE "stockUsed" IS NULL OR "stockUsed" = '';

UPDATE "JobCard" 
SET "materialsBought" = '[]' 
WHERE "materialsBought" IS NULL OR "materialsBought" = '';

