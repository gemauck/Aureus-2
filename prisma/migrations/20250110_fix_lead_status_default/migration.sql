-- AlterTable: Fix lead status default value
-- Change default from "active" to "Potential" for leads
-- This fixes the issue where lead status reverts to "Potential" on page refresh

-- Note: SQLite doesn't support ALTER COLUMN to change defaults, so we'll only update existing data
-- The default is managed in the Prisma schema

-- Update existing leads with "active" status to "Potential" 
-- (only for leads, not clients)
UPDATE "Client" 
SET "status" = 'Potential' 
WHERE "type" = 'lead' 
  AND ("status" = 'active' OR "status" IS NULL OR "status" = '');
