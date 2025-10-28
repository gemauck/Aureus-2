-- AlterTable: Fix lead status default value
-- Change default from "active" to "Potential" for leads
-- This fixes the issue where lead status reverts to "Potential" on page refresh

-- Change the default value for the status column
ALTER TABLE "Client" ALTER COLUMN "status" SET DEFAULT 'Potential';

-- Update existing leads with "active" status to "Potential" 
-- (only for leads, not clients)
UPDATE "Client" 
SET "status" = 'Potential' 
WHERE "type" = 'lead' 
  AND ("status" = 'active' OR "status" IS NULL OR "status" = '');

-- Optionally update clients to use capitalized "Active" instead of lowercase "active"
-- Comment out if you want to keep lowercase for clients
-- UPDATE "Client" 
-- SET "status" = 'Active' 
-- WHERE "type" = 'client' 
--   AND "status" = 'active';
