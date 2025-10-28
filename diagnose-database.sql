-- Database Diagnostic Script
-- Run this to check the current state of opportunities, sites, contacts, etc.

-- 1. Check if opportunities table exists and has data
SELECT 'Opportunities Table' AS check_name,
       COUNT(*) AS total_count,
       COUNT(CASE WHEN "createdAt" > NOW() - INTERVAL '1 hour' THEN 1 END) AS created_last_hour
FROM "Opportunity";

-- 2. Check opportunities for specific client
SELECT 'Client Opportunities' AS check_name,
       c.id AS client_id,
       c.name AS client_name,
       COUNT(o.id) AS opportunity_count
FROM "Client" c
LEFT JOIN "Opportunity" o ON o."clientId" = c.id
WHERE c.id = 'cmh9mhcne0001723xifv2lsqo'
GROUP BY c.id, c.name;

-- 3. List all opportunities for that client
SELECT id, title, stage, value, "createdAt", "updatedAt"
FROM "Opportunity"
WHERE "clientId" = 'cmh9mhcne0001723xifv2lsqo'
ORDER BY "createdAt" DESC;

-- 4. Check clients table - verify contacts, sites, comments are stored
SELECT 
    id,
    name,
    CASE 
        WHEN contacts IS NULL THEN 'NULL'
        WHEN contacts = '' THEN 'EMPTY'
        WHEN contacts = '[]' THEN 'EMPTY ARRAY'
        ELSE CONCAT('HAS DATA (', LENGTH(contacts), ' chars)')
    END AS contacts_status,
    CASE 
        WHEN sites IS NULL THEN 'NULL'
        WHEN sites = '' THEN 'EMPTY'
        WHEN sites = '[]' THEN 'EMPTY ARRAY'
        ELSE CONCAT('HAS DATA (', LENGTH(sites), ' chars)')
    END AS sites_status,
    CASE 
        WHEN comments IS NULL THEN 'NULL'
        WHEN comments = '' THEN 'EMPTY'
        WHEN comments = '[]' THEN 'EMPTY ARRAY'
        ELSE CONCAT('HAS DATA (', LENGTH(comments), ' chars)')
    END AS comments_status,
    CASE 
        WHEN "followUps" IS NULL THEN 'NULL'
        WHEN "followUps" = '' THEN 'EMPTY'
        WHEN "followUps" = '[]' THEN 'EMPTY ARRAY'
        ELSE CONCAT('HAS DATA (', LENGTH("followUps"), ' chars)')
    END AS followups_status,
    CASE 
        WHEN "activityLog" IS NULL THEN 'NULL'
        WHEN "activityLog" = '' THEN 'EMPTY'
        WHEN "activityLog" = '[]' THEN 'EMPTY ARRAY'
        ELSE CONCAT('HAS DATA (', LENGTH("activityLog"), ' chars)')
    END AS activity_status
FROM "Client"
WHERE id = 'cmh9mhcne0001723xifv2lsqo';

-- 5. Check database connections
SELECT 
    'Active Connections' AS check_name,
    count(*) AS connection_count,
    max(backend_start) AS oldest_connection
FROM pg_stat_activity
WHERE datname = current_database();

-- 6. Check for table locks
SELECT 
    'Table Locks' AS check_name,
    schemaname,
    tablename,
    COUNT(*) AS lock_count
FROM pg_locks l
JOIN pg_class t ON l.relation = t.oid
JOIN pg_namespace n ON t.relnamespace = n.oid
WHERE n.nspname = 'public'
GROUP BY schemaname, tablename
HAVING COUNT(*) > 0;

-- 7. Check recent client updates
SELECT 
    id,
    name,
    status,
    "updatedAt",
    EXTRACT(EPOCH FROM (NOW() - "updatedAt")) AS seconds_since_update
FROM "Client"
WHERE "updatedAt" > NOW() - INTERVAL '1 hour'
ORDER BY "updatedAt" DESC
LIMIT 10;

-- 8. Verify JSON fields are valid
SELECT 
    id,
    name,
    CASE 
        WHEN contacts::jsonb IS NOT NULL THEN 'VALID JSON'
        ELSE 'INVALID'
    END AS contacts_valid,
    CASE 
        WHEN sites::jsonb IS NOT NULL THEN 'VALID JSON'
        ELSE 'INVALID'
    END AS sites_valid,
    CASE 
        WHEN comments::jsonb IS NOT NULL THEN 'VALID JSON'
        ELSE 'INVALID'
    END AS comments_valid
FROM "Client"
WHERE id = 'cmh9mhcne0001723xifv2lsqo';

-- 9. Count all data for the test client
SELECT 
    'Data Summary' AS check_name,
    (SELECT COUNT(*) FROM "Opportunity" WHERE "clientId" = 'cmh9mhcne0001723xifv2lsqo') AS opportunities,
    (SELECT COUNT(*) FROM "Project" WHERE "clientId" = 'cmh9mhcne0001723xifv2lsqo') AS projects,
    (SELECT 
        CASE 
            WHEN contacts IS NULL OR contacts = '' OR contacts = '[]' THEN 0
            ELSE jsonb_array_length(contacts::jsonb)
        END
     FROM "Client" WHERE id = 'cmh9mhcne0001723xifv2lsqo') AS contacts,
    (SELECT 
        CASE 
            WHEN sites IS NULL OR sites = '' OR sites = '[]' THEN 0
            ELSE jsonb_array_length(sites::jsonb)
        END
     FROM "Client" WHERE id = 'cmh9mhcne0001723xifv2lsqo') AS sites;

-- 10. Check for any recent errors in the database log
-- (This requires superuser access, may not work)
-- SELECT * FROM pg_stat_database WHERE datname = current_database();
