-- Migration script to remove parent company concept
-- This script cleans up parentGroupId data before schema migration

-- Step 1: Set all parentGroupId to NULL (cleanup before removing field)
UPDATE "Client" SET "parentGroupId" = NULL WHERE "parentGroupId" IS NOT NULL;

-- Step 2: Verify cleanup
SELECT COUNT(*) as clients_with_parent_group FROM "Client" WHERE "parentGroupId" IS NOT NULL;
-- Should return 0

-- Note: After running this script, run:
-- npx prisma migrate dev --name remove_parent_company
-- This will create a migration to remove the parentGroupId field, parentGroup relation, and childCompanies relation from the schema

