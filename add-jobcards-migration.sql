-- Add Job Card table for Technical Team field agents
-- Run this migration to create the JobCard table in the database

CREATE TABLE IF NOT EXISTS "JobCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobCardNumber" TEXT NOT NULL UNIQUE,
    "agentName" TEXT NOT NULL DEFAULT '',
    "otherTechnicians" TEXT NOT NULL DEFAULT '[]',
    "clientId" TEXT,
    "clientName" TEXT NOT NULL DEFAULT '',
    "siteId" TEXT NOT NULL DEFAULT '',
    "siteName" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "timeOfDeparture" TIMESTAMP,
    "timeOfArrival" TIMESTAMP,
    "vehicleUsed" TEXT NOT NULL DEFAULT '',
    "kmReadingBefore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kmReadingAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "travelKilometers" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reasonForVisit" TEXT NOT NULL DEFAULT '',
    "diagnosis" TEXT NOT NULL DEFAULT '',
    "otherComments" TEXT NOT NULL DEFAULT '',
    "photos" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedAt" TIMESTAMP,
    "completedAt" TIMESTAMP,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "JobCard_clientId_idx" ON "JobCard"("clientId");
CREATE INDEX IF NOT EXISTS "JobCard_ownerId_idx" ON "JobCard"("ownerId");
CREATE INDEX IF NOT EXISTS "JobCard_status_idx" ON "JobCard"("status");
CREATE INDEX IF NOT EXISTS "JobCard_createdAt_idx" ON "JobCard"("createdAt");

-- Add trigger to auto-update updatedAt timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_jobcard_updated_at BEFORE UPDATE ON "JobCard"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

