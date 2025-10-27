-- Performance Indexes for PostgreSQL Database
-- Add these indexes to improve query performance

-- Client table indexes
CREATE INDEX IF NOT EXISTS "Client_createdAt_idx" ON "Client"("createdAt");
CREATE INDEX IF NOT EXISTS "Client_type_idx" ON "Client"("type");
CREATE INDEX IF NOT EXISTS "Client_status_idx" ON "Client"("status");
CREATE INDEX IF NOT EXISTS "Client_ownerId_idx" ON "Client"("ownerId");

-- Project table indexes
CREATE INDEX IF NOT EXISTS "Project_clientId_idx" ON "Project"("clientId");
CREATE INDEX IF NOT EXISTS "Project_status_idx" ON "Project"("status");
CREATE INDEX IF NOT EXISTS "Project_ownerId_idx" ON "Project"("ownerId");
CREATE INDEX IF NOT EXISTS "Project_createdAt_idx" ON "Project"("createdAt");

