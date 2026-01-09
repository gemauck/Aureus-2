-- Performance Indexes for User table
-- These indexes dramatically improve query performance for the users page

-- Index for ordering by creation date (most common query)
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");

-- Index for filtering by role
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status");

-- Index for filtering by department
CREATE INDEX IF NOT EXISTS "User_department_idx" ON "User"("department");

-- Index for last seen queries (online status checks)
CREATE INDEX IF NOT EXISTS "User_lastSeenAt_idx" ON "User"("lastSeenAt");

-- Invitation table indexes
CREATE INDEX IF NOT EXISTS "Invitation_createdAt_idx" ON "Invitation"("createdAt");
CREATE INDEX IF NOT EXISTS "Invitation_status_idx" ON "Invitation"("status");

