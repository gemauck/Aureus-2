-- Verify database schema for Client table
-- Run with: sqlite3 prisma/dev.db < verify-schema.sql

.headers on
.mode column

-- Show the Client table schema
SELECT '=== CLIENT TABLE SCHEMA ===';
PRAGMA table_info(Client);

-- Show total counts
SELECT '';
SELECT '=== DATA COUNTS ===';
SELECT 'Total Clients:' as metric, COUNT(*) as count FROM Client WHERE type = 'client'
UNION ALL
SELECT 'Total Leads:' as metric, COUNT(*) as count FROM Client WHERE type = 'lead'
UNION ALL
SELECT 'Leads with NULL stage:' as metric, COUNT(*) as count FROM Client WHERE type = 'lead' AND stage IS NULL
UNION ALL
SELECT 'Leads with empty stage:' as metric, COUNT(*) as count FROM Client WHERE type = 'lead' AND stage = '';

-- Show sample lead data
SELECT '';
SELECT '=== SAMPLE LEAD DATA ===';
SELECT id, name, type, status, stage, updatedAt 
FROM Client 
WHERE type = 'lead' 
ORDER BY updatedAt DESC 
LIMIT 5;

-- Show leads grouped by status
SELECT '';
SELECT '=== LEADS BY STATUS ===';
SELECT status, COUNT(*) as count 
FROM Client 
WHERE type = 'lead' 
GROUP BY status 
ORDER BY count DESC;

-- Show leads grouped by stage
SELECT '';
SELECT '=== LEADS BY STAGE ===';
SELECT stage, COUNT(*) as count 
FROM Client 
WHERE type = 'lead' 
GROUP BY stage 
ORDER BY count DESC;
