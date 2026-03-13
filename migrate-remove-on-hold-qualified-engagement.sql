-- One-time data migration: set Engagement Stage "On Hold" and "Qualified" to "Potential"
-- so these removed options no longer appear in the DB. Run once then optional to delete this file.

UPDATE "Client"
SET "engagementStage" = 'Potential'
WHERE LOWER(TRIM("engagementStage")) IN ('on hold', 'qualified');

UPDATE "ClientSite"
SET "engagementStage" = 'Potential'
WHERE "engagementStage" IS NOT NULL AND LOWER(TRIM("engagementStage")) IN ('on hold', 'qualified');

UPDATE "Opportunity"
SET "engagementStage" = 'Potential'
WHERE LOWER(TRIM("engagementStage")) IN ('on hold', 'qualified');
