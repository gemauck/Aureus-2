#!/bin/bash
# Check detailed record counts

DB_USER="doadmin"
DB_PASSWORD="${DB_PASSWORD:-YOUR_PASSWORD_HERE}"
DB_HOST="dbaas-db-6934625-nov-3-backup-do-user-28031752-0.e.db.ondigitalocean.com"
DB_PORT="25060"
DB_NAME="defaultdb"

echo "📊 Detailed Record Counts in Restored Database:"
echo ""

PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" <<EOF 2>/dev/null
\echo 'Users:'
SELECT COUNT(*) as count FROM "User";

\echo ''
\echo 'Clients:'
SELECT COUNT(*) as count FROM "Client";

\echo ''
\echo 'Projects:'
SELECT COUNT(*) as count FROM "Project";

\echo ''
\echo 'Job Cards:'
SELECT COUNT(*) as count FROM "JobCard";

\echo ''
\echo 'Leads:'
SELECT COUNT(*) as count FROM "Lead";

\echo ''
\echo 'Opportunities:'
SELECT COUNT(*) as count FROM "Opportunity";

\echo ''
\echo 'Inventory Items:'
SELECT COUNT(*) as count FROM "InventoryItem";

\echo ''
\echo 'Sales Orders:'
SELECT COUNT(*) as count FROM "SalesOrder";

\echo ''
\echo 'Production Orders:'
SELECT COUNT(*) as count FROM "ProductionOrder";

\echo ''
\echo 'Tasks:'
SELECT COUNT(*) as count FROM "Task";

\echo ''
\echo '📅 Latest Activity Dates:'
\echo '---'
SELECT 
    'User' as table_name,
    MAX("createdAt") as latest_created,
    MAX("updatedAt") as latest_updated
FROM "User"
UNION ALL
SELECT 
    'Client',
    MAX("createdAt"),
    MAX("updatedAt")
FROM "Client"
UNION ALL
SELECT 
    'Project',
    MAX("createdAt"),
    MAX("updatedAt")
FROM "Project"
UNION ALL
SELECT 
    'JobCard',
    MAX("createdAt"),
    MAX("updatedAt")
FROM "JobCard";

\echo ''
\echo '🔍 Sample Data Check (first 3 records):'
\echo '---'
\echo 'Users:'
SELECT id, email, name, "createdAt" FROM "User" ORDER BY "createdAt" DESC LIMIT 3;
\echo ''
\echo 'Clients:'
SELECT id, name, "clientType", "createdAt" FROM "Client" ORDER BY "createdAt" DESC LIMIT 3;
\echo ''
\echo 'Projects:'
SELECT id, name, "clientId", "createdAt" FROM "Project" ORDER BY "createdAt" DESC LIMIT 3;
EOF

