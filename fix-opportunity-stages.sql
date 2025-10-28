-- Fix opportunity stages to use AIDA pipeline stages
-- This migrates existing opportunities from "prospect" to "Awareness"

UPDATE "Opportunity"
SET stage = 'Awareness'
WHERE stage = 'prospect' OR stage = 'new' OR stage IS NULL OR stage = '';

-- Also fix any opportunities with invalid stages
UPDATE "Opportunity"
SET stage = 'Awareness'
WHERE stage NOT IN ('Awareness', 'Interest', 'Desire', 'Action');

-- Verify the update
SELECT stage, COUNT(*) as count
FROM "Opportunity"
GROUP BY stage;

