-- Simple database verification - outputs formatted data
.mode box
.headers on

SELECT '=== SCHEMA CHECK ===' as info;
SELECT '';

-- Check if stage column exists in Client table
SELECT name, type, dflt_value 
FROM pragma_table_info('Client') 
WHERE name IN ('id', 'name', 'type', 'status', 'stage', 'updatedAt')
ORDER BY cid;

SELECT '';
SELECT '=== DATA CHECK ===' as info;
SELECT '';

-- Count clients and leads
SELECT 
    'Clients' as category,
    COUNT(*) as count
FROM Client 
WHERE type = 'client'
UNION ALL
SELECT 
    'Leads' as category,
    COUNT(*) as count
FROM Client 
WHERE type = 'lead'
UNION ALL
SELECT 
    'Leads with NULL stage' as category,
    COUNT(*) as count
FROM Client 
WHERE type = 'lead' AND stage IS NULL
UNION ALL
SELECT 
    'Leads with empty stage' as category,
    COUNT(*) as count
FROM Client 
WHERE type = 'lead' AND stage = '';

SELECT '';
SELECT '=== RECENT LEADS ===' as info;
SELECT '';

-- Show recent leads if any exist
SELECT 
    substr(name, 1, 30) as name,
    status,
    stage,
    datetime(updatedAt) as last_updated
FROM Client 
WHERE type = 'lead'
ORDER BY updatedAt DESC
LIMIT 5;

SELECT '';
SELECT '=== STAGE DISTRIBUTION ===' as info;
SELECT '';

-- Show how many leads are in each stage
SELECT 
    COALESCE(stage, 'NULL') as stage,
    COUNT(*) as count
FROM Client 
WHERE type = 'lead'
GROUP BY stage
ORDER BY count DESC;
