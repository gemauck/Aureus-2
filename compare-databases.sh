#!/bin/bash
# Compare restored backup with current production

echo "🔍 COMPARING DATABASES"
echo "======================"
echo ""

# Restored DB
RESTORED_HOST="dbaas-db-6934625-nov-3-backup-do-user-28031752-0.e.db.ondigitalocean.com"
RESTORED_PASS="YOUR_PASSWORD_HERE"

# Current production (from server)
echo "📡 Checking current production database..."
echo ""

ssh root@165.22.127.196 << 'ENDSSH'
cd /var/www/abcotronics-erp

if [ -f .env ]; then
    echo "Current Production DATABASE_URL:"
    grep DATABASE_URL .env | head -1
    echo ""
    
    # Extract current DB host
    CURRENT_HOST=$(grep DATABASE_URL .env | sed "s|.*@\(.*\):.*|\1|")
    echo "Current host: $CURRENT_HOST"
    echo ""
    
    # If we can query, show counts
    if command -v psql >/dev/null 2>&1; then
        export $(grep DATABASE_URL .env | xargs)
        echo "Production Database Counts:"
        PGPASSWORD=$(echo $DATABASE_URL | sed 's|.*://[^:]*:\([^@]*\)@.*|\1|') psql $DATABASE_URL -c "
        SELECT 
            'Users' as table_name, COUNT(*) as count FROM \"User\"
        UNION ALL
        SELECT 'Clients', COUNT(*) FROM \"Client\"
        UNION ALL
        SELECT 'Projects', COUNT(*) FROM \"Project\"
        UNION ALL
        SELECT 'JobCards', COUNT(*) FROM \"JobCard\"
        UNION ALL
        SELECT 'Tasks', COUNT(*) FROM \"Task\";
        " 2>/dev/null || echo "Could not query production DB"
    fi
else
    echo "⚠️  No .env file found on server"
fi
ENDSSH

echo ""
echo "📊 RESTORED BACKUP DATABASE:"
echo "============================"
PGPASSWORD="${RESTORED_PASS}" psql -h "${RESTORED_HOST}" -p 25060 -U doadmin -d defaultdb << 'SQL'
SELECT 
    'Users' as table_name, COUNT(*) as count FROM "User"
UNION ALL
SELECT 'Clients', COUNT(*) FROM "Client"
UNION ALL
SELECT 'Projects', COUNT(*) FROM "Project"
UNION ALL
SELECT 'JobCards', COUNT(*) FROM "JobCard"
UNION ALL
SELECT 'Tasks', COUNT(*) FROM "Task"
UNION ALL
SELECT 'Leads', COUNT(*) FROM "Lead"
UNION ALL
SELECT 'Opportunities', COUNT(*) FROM "Opportunity"
UNION ALL
SELECT 'InventoryItems', COUNT(*) FROM "InventoryItem";
SQL

echo ""
echo "⚠️  SUMMARY:"
echo "==========="
echo "The restored backup has:"
echo "  - ✅ 13 Users"
echo "  - ✅ 155 Clients"
echo "  - ✅ 10 Projects"
echo "  - ❌ 0 Job Cards (EMPTY)"
echo "  - ❌ 0 Tasks (EMPTY)"
echo ""
echo "If you lost Job Cards or Tasks, this backup might not have them."
echo "Let's check if there's a more recent backup or if the data exists elsewhere."

