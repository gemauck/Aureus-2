-- One-time data migration: set removed Engagement Stage options to "Potential"
-- (On Hold, Qualified, Inactive). Run once then optional to delete this file.

UPDATE "Client"
SET "engagementStage" = 'Potential'
WHERE LOWER(TRIM("engagementStage")) IN ('on hold', 'qualified', 'inactive');

UPDATE "ClientSite"
SET "engagementStage" = 'Potential'
WHERE "engagementStage" IS NOT NULL AND LOWER(TRIM("engagementStage")) IN ('on hold', 'qualified', 'inactive');

UPDATE "Opportunity"
SET "engagementStage" = 'Potential'
WHERE LOWER(TRIM("engagementStage")) IN ('on hold', 'qualified', 'inactive');
