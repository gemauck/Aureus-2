#!/bin/bash
# Investigate lost entries from user "darren" yesterday
# This script queries the database to find what entries were made and what might have happened

# Database connection details
DB_HOST="${DB_HOST:-dbaas-db-6934625-nov-3-backup-do-user-28031752-0.e.db.ondigitalocean.com}"
DB_PORT="${DB_PORT:-25060}"
DB_USER="${DB_USER:-doadmin}"
DB_NAME="${DB_NAME:-defaultdb}"
DB_PASS="${DB_PASS:-YOUR_PASSWORD_HERE}"

# Calculate yesterday's date range (start and end of yesterday)
YESTERDAY_START=$(date -v-1d -u +"%Y-%m-%d 00:00:00+00" 2>/dev/null || date -d "yesterday" -u +"%Y-%m-%d 00:00:00+00" 2>/dev/null || date -d "1 day ago" -u +"%Y-%m-%d 00:00:00+00")
YESTERDAY_END=$(date -v-1d -u +"%Y-%m-%d 23:59:59+00" 2>/dev/null || date -d "yesterday" -u +"%Y-%m-%d 23:59:59+00" 2>/dev/null || date -d "1 day ago" -u +"%Y-%m-%d 23:59:59+00")

echo "🔍 INVESTIGATING LOST ENTRIES FROM DARREN"
echo "=========================================="
echo ""
echo "📅 Date Range: $YESTERDAY_START to $YESTERDAY_END"
echo ""

if [ "$DB_PASS" = "YOUR_PASSWORD_HERE" ]; then
    echo "⚠️  WARNING: Please set DB_PASS environment variable"
    echo "   Example: DB_PASS=your_password ./investigate-darren-entries.sh"
    echo ""
    read -sp "Enter database password: " DB_PASS
    echo ""
fi

echo "🔍 Step 1: Finding user 'darren' in database..."
echo "------------------------------------------------"
PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" << 'SQL1'
\echo 'Searching for user "darren" (case-insensitive)...'
SELECT 
    id,
    email,
    name,
    role,
    "createdAt",
    "lastLoginAt"
FROM "User"
WHERE LOWER(name) LIKE '%darren%' 
   OR LOWER(email) LIKE '%darren%'
ORDER BY "createdAt" DESC;
SQL1

echo ""
echo "🔍 Step 2: Checking AuditLog entries from yesterday..."
echo "--------------------------------------------------------"
PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" << SQL2
\echo 'Audit logs from yesterday (all users):'
SELECT 
    al.id,
    al."createdAt",
    al.action,
    al.entity,
    al."entityId",
    al.diff,
    u.name as actor_name,
    u.email as actor_email
FROM "AuditLog" al
JOIN "User" u ON al."actorId" = u.id
WHERE al."createdAt" >= '$YESTERDAY_START'::timestamp
  AND al."createdAt" <= '$YESTERDAY_END'::timestamp
ORDER BY al."createdAt" DESC
LIMIT 100;
SQL2

echo ""
echo "🔍 Step 3: Checking AuditLog entries specifically from darren..."
echo "----------------------------------------------------------------"
PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" << SQL3
\echo 'Audit logs from darren yesterday:'
SELECT 
    al.id,
    al."createdAt",
    al.action,
    al.entity,
    al."entityId",
    al.diff,
    u.name as actor_name,
    u.email as actor_email
FROM "AuditLog" al
JOIN "User" u ON al."actorId" = u.id
WHERE (LOWER(u.name) LIKE '%darren%' OR LOWER(u.email) LIKE '%darren%')
  AND al."createdAt" >= '$YESTERDAY_START'::timestamp
  AND al."createdAt" <= '$YESTERDAY_END'::timestamp
ORDER BY al."createdAt" DESC;
SQL3

echo ""
echo "🔍 Step 4: Checking entries created/updated yesterday in key tables..."
echo "------------------------------------------------------------------------"
PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" << SQL4
\echo 'Projects created/updated yesterday:'
SELECT 
    id,
    name,
    "clientName",
    status,
    "createdAt",
    "updatedAt",
    "ownerId"
FROM "Project"
WHERE ("createdAt" >= '$YESTERDAY_START'::timestamp AND "createdAt" <= '$YESTERDAY_END'::timestamp)
   OR ("updatedAt" >= '$YESTERDAY_START'::timestamp AND "updatedAt" <= '$YESTERDAY_END'::timestamp)
ORDER BY "updatedAt" DESC, "createdAt" DESC
LIMIT 50;

\echo ''
\echo 'Clients created/updated yesterday:'
SELECT 
    id,
    name,
    type,
    status,
    "createdAt",
    "updatedAt",
    "ownerId"
FROM "Client"
WHERE ("createdAt" >= '$YESTERDAY_START'::timestamp AND "createdAt" <= '$YESTERDAY_END'::timestamp)
   OR ("updatedAt" >= '$YESTERDAY_START'::timestamp AND "updatedAt" <= '$YESTERDAY_END'::timestamp)
ORDER BY "updatedAt" DESC, "createdAt" DESC
LIMIT 50;

\echo ''
\echo 'Time Entries created/updated yesterday:'
SELECT 
    id,
    date,
    hours,
    "projectName",
    task,
    description,
    employee,
    "createdAt",
    "updatedAt",
    "ownerId"
FROM "TimeEntry"
WHERE ("createdAt" >= '$YESTERDAY_START'::timestamp AND "createdAt" <= '$YESTERDAY_END'::timestamp)
   OR ("updatedAt" >= '$YESTERDAY_START'::timestamp AND "updatedAt" <= '$YESTERDAY_END'::timestamp)
ORDER BY "updatedAt" DESC, "createdAt" DESC
LIMIT 50;

\echo ''
\echo 'Job Cards created/updated yesterday:'
SELECT 
    id,
    "jobCardNumber",
    "clientName",
    "siteName",
    status,
    "createdAt",
    "updatedAt",
    "ownerId"
FROM "JobCard"
WHERE ("createdAt" >= '$YESTERDAY_START'::timestamp AND "createdAt" <= '$YESTERDAY_END'::timestamp)
   OR ("updatedAt" >= '$YESTERDAY_START'::timestamp AND "updatedAt" <= '$YESTERDAY_END'::timestamp)
ORDER BY "updatedAt" DESC, "createdAt" DESC
LIMIT 50;

\echo ''
\echo 'User Tasks created/updated yesterday:'
SELECT 
    id,
    title,
    status,
    "dueDate",
    "createdAt",
    "updatedAt",
    "ownerId"
FROM "UserTask"
WHERE ("createdAt" >= '$YESTERDAY_START'::timestamp AND "createdAt" <= '$YESTERDAY_END'::timestamp)
   OR ("updatedAt" >= '$YESTERDAY_START'::timestamp AND "updatedAt" <= '$YESTERDAY_END'::timestamp)
ORDER BY "updatedAt" DESC, "createdAt" DESC
LIMIT 50;
SQL4

echo ""
echo "🔍 Step 5: Checking entries created by darren (by ownerId) yesterday..."
echo "----------------------------------------------------------------------"
PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" << SQL5
\echo 'Finding darren'\''s user ID...'
WITH darren_user AS (
    SELECT id, email, name
    FROM "User"
    WHERE LOWER(name) LIKE '%darren%' 
       OR LOWER(email) LIKE '%darren%'
    LIMIT 1
)
SELECT 
    'Projects' as table_name,
    COUNT(*) as entries_yesterday
FROM "Project" p, darren_user d
WHERE p."ownerId" = d.id
  AND (p."createdAt" >= '$YESTERDAY_START'::timestamp AND p."createdAt" <= '$YESTERDAY_END'::timestamp)
UNION ALL
SELECT 
    'Clients' as table_name,
    COUNT(*) as entries_yesterday
FROM "Client" c, darren_user d
WHERE c."ownerId" = d.id
  AND (c."createdAt" >= '$YESTERDAY_START'::timestamp AND c."createdAt" <= '$YESTERDAY_END'::timestamp)
UNION ALL
SELECT 
    'Time Entries' as table_name,
    COUNT(*) as entries_yesterday
FROM "TimeEntry" t, darren_user d
WHERE t."ownerId" = d.id
  AND (t."createdAt" >= '$YESTERDAY_START'::timestamp AND t."createdAt" <= '$YESTERDAY_END'::timestamp)
UNION ALL
SELECT 
    'Job Cards' as table_name,
    COUNT(*) as entries_yesterday
FROM "JobCard" j, darren_user d
WHERE j."ownerId" = d.id
  AND (j."createdAt" >= '$YESTERDAY_START'::timestamp AND j."createdAt" <= '$YESTERDAY_END'::timestamp)
UNION ALL
SELECT 
    'User Tasks' as table_name,
    COUNT(*) as entries_yesterday
FROM "UserTask" ut, darren_user d
WHERE ut."ownerId" = d.id
  AND (ut."createdAt" >= '$YESTERDAY_START'::timestamp AND ut."createdAt" <= '$YESTERDAY_END'::timestamp);
SQL5

echo ""
echo "🔍 Step 6: Checking for database issues or rollbacks..."
echo "------------------------------------------------------"
PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" << 'SQL6'
\echo 'Checking for orphaned entries (created but no owner exists):'
SELECT 
    'Project' as table_name,
    COUNT(*) as orphaned_count
FROM "Project" p
WHERE p."ownerId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = p."ownerId")
UNION ALL
SELECT 
    'Client' as table_name,
    COUNT(*) as orphaned_count
FROM "Client" c
WHERE c."ownerId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = c."ownerId")
UNION ALL
SELECT 
    'TimeEntry' as table_name,
    COUNT(*) as orphaned_count
FROM "TimeEntry" t
WHERE t."ownerId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = t."ownerId");

\echo ''
\echo 'Checking for entries with temp IDs (might indicate failed saves):'
SELECT 
    'Project' as table_name,
    COUNT(*) as temp_id_count
FROM "Project"
WHERE id LIKE 'temp_%'
UNION ALL
SELECT 
    'Client' as table_name,
    COUNT(*) as temp_id_count
FROM "Client"
WHERE id LIKE 'temp_%'
UNION ALL
SELECT 
    'TimeEntry' as table_name,
    COUNT(*) as temp_id_count
FROM "TimeEntry"
WHERE id LIKE 'temp_%';
SQL6

echo ""
echo "🔍 Step 7: Checking MonthlyDocumentCollectionTracker data..."
echo "-------------------------------------------------------------"
PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" << SQL7
\echo 'Projects with document collection data updated yesterday:'
SELECT 
    id,
    name,
    "hasDocumentCollectionProcess",
    "documentSections",
    "updatedAt"
FROM "Project"
WHERE "hasDocumentCollectionProcess" = true
  AND "updatedAt" >= '$YESTERDAY_START'::timestamp
  AND "updatedAt" <= '$YESTERDAY_END'::timestamp
ORDER BY "updatedAt" DESC
LIMIT 20;
SQL7

echo ""
echo "════════════════════════════════════════════════════════"
echo "📊 INVESTIGATION SUMMARY"
echo "════════════════════════════════════════════════════════"
echo ""
echo "✅ Investigation complete!"
echo ""
echo "💡 Next Steps:"
echo "   1. Review the audit logs above to see what darren did"
echo "   2. Check if entries exist but are associated with wrong user"
echo "   3. Check if entries were created with temp IDs (failed saves)"
echo "   4. Review server logs for errors during that time period"
echo "   5. Check if there was a database restore or migration"
echo ""
echo "🔍 To check server logs:"
echo "   ssh root@abcoafrica.co.za"
echo "   cd /var/www/abcotronics-erp"
echo "   pm2 logs abcotronics-erp --lines 1000 | grep -i darren"
echo ""


