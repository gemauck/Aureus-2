-- Ensure stage field exists and has proper values for all leads
-- This script is idempotent and safe to run multiple times

-- Check if stage column exists, add if it doesn't
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we'll handle this in the app

-- Update any leads that have NULL or empty stage to have default 'Awareness'
UPDATE Client 
SET stage = 'Awareness' 
WHERE type = 'lead' 
AND (stage IS NULL OR stage = '');

-- Verify the update
SELECT 
    id,
    name, 
    type,
    status,
    stage,
    createdAt,
    updatedAt
FROM Client 
WHERE type = 'lead'
ORDER BY updatedAt DESC
LIMIT 20;

-- Count leads by stage to verify data
SELECT 
    stage,
    COUNT(*) as count
FROM Client
WHERE type = 'lead'
GROUP BY stage
ORDER BY count DESC;
