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

-- Opportunity table indexes (CRITICAL for CRM performance)
CREATE INDEX IF NOT EXISTS "Opportunity_clientId_idx" ON "Opportunity"("clientId");
CREATE INDEX IF NOT EXISTS "Opportunity_createdAt_idx" ON "Opportunity"("createdAt");

-- User table indexes (CRITICAL for users page performance)
CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status");
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX IF NOT EXISTS "User_name_idx" ON "User"("name");
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");

-- Task table indexes (CRITICAL for tasks API performance)
CREATE INDEX IF NOT EXISTS "Task_assigneeId_idx" ON "Task"("assigneeId");
CREATE INDEX IF NOT EXISTS "Task_projectId_idx" ON "Task"("projectId");
CREATE INDEX IF NOT EXISTS "Task_status_idx" ON "Task"("status");
CREATE INDEX IF NOT EXISTS "Task_dueDate_idx" ON "Task"("dueDate");
CREATE INDEX IF NOT EXISTS "Task_createdAt_idx" ON "Task"("createdAt");

-- Opportunity table additional indexes
CREATE INDEX IF NOT EXISTS "Opportunity_ownerId_idx" ON "Opportunity"("ownerId");
CREATE INDEX IF NOT EXISTS "Opportunity_status_idx" ON "Opportunity"("status");

-- Project table additional index for updatedAt (used in tasks query)
CREATE INDEX IF NOT EXISTS "Project_updatedAt_idx" ON "Project"("updatedAt");

