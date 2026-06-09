-- Many-to-many links between incident reports and job cards (idempotent).
CREATE TABLE IF NOT EXISTS "IncidentReportJobCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentReportId" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "jobCardNumber" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncidentReportJobCard_incidentReportId_fkey"
        FOREIGN KEY ("incidentReportId") REFERENCES "IncidentReport"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IncidentReportJobCard_jobCardId_fkey"
        FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "IncidentReportJobCard_incidentReportId_jobCardId_key"
    ON "IncidentReportJobCard"("incidentReportId", "jobCardId");
CREATE INDEX IF NOT EXISTS "IncidentReportJobCard_incidentReportId_idx"
    ON "IncidentReportJobCard"("incidentReportId");
CREATE INDEX IF NOT EXISTS "IncidentReportJobCard_jobCardId_idx"
    ON "IncidentReportJobCard"("jobCardId");

-- Backfill from legacy single jobCardId column.
INSERT INTO "IncidentReportJobCard" ("id", "incidentReportId", "jobCardId", "jobCardNumber", "createdAt")
SELECT
    'irjc_' || "id" || '_' || "jobCardId",
    "id",
    "jobCardId",
    COALESCE("jobCardNumber", ''),
    COALESCE("createdAt", CURRENT_TIMESTAMP)
FROM "IncidentReport"
WHERE "jobCardId" IS NOT NULL
  AND TRIM("jobCardId") <> ''
ON CONFLICT ("incidentReportId", "jobCardId") DO NOTHING;
