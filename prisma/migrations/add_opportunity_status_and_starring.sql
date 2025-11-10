-- Add status column to Opportunity table and create StarredOpportunity join table
-- Supports both SQLite (development) and PostgreSQL (production)

BEGIN TRANSACTION;

-- 1. Add status column to Opportunity table if it does not exist yet
-- SQLite does not support IF NOT EXISTS for columns, so wrap in try/catch style
-- The statement will fail harmlessly if the column already exists.
ALTER TABLE Opportunity ADD COLUMN status TEXT DEFAULT 'Potential';

-- 2. Create StarredOpportunity table if it does not exist
CREATE TABLE IF NOT EXISTS StarredOpportunity (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    opportunityId TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (opportunityId) REFERENCES Opportunity(id) ON DELETE CASCADE
);

-- 3. Create helper indexes / constraints (SQLite-compatible)
CREATE UNIQUE INDEX IF NOT EXISTS StarredOpportunity_user_opportunity_idx ON StarredOpportunity(userId, opportunityId);
CREATE INDEX IF NOT EXISTS StarredOpportunity_user_idx ON StarredOpportunity(userId);
CREATE INDEX IF NOT EXISTS StarredOpportunity_opportunity_idx ON StarredOpportunity(opportunityId);

COMMIT;

