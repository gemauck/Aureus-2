#!/bin/bash
# Diagnose why data isn't showing on production site

DB_HOST="dbaas-db-6934625-nov-3-backup-do-user-28031752-0.e.db.ondigitalocean.com"
DB_PASS="${DB_PASS:-YOUR_PASSWORD_HERE}"

echo "🔍 DIAGNOSING DATA VISIBILITY ISSUE"
echo "===================================="
echo ""

echo "📊 Database Contents (Direct Query):"
echo "------------------------------------"
PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -p 25060 -U doadmin -d defaultdb << 'SQL'
\echo '1. Total Users:'
SELECT COUNT(*) FROM "User";

\echo ''
\echo '2. Total Clients:'
SELECT COUNT(*) FROM "Client";

\echo ''
\echo '3. Total Projects:'
SELECT COUNT(*) FROM "Project";

\echo ''
\echo '4. All User IDs and Emails:'
SELECT id, email, name, role FROM "User" ORDER BY "createdAt" DESC;

\echo ''
\echo '5. Users by Role:'
SELECT role, COUNT(*) as count FROM "User" GROUP BY role;

SQL

echo ""
echo "🔍 Checking which user is authenticated in logs..."
echo "The logs show user: cmhjfemdh0000c0251ay2vr00"
echo ""

PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -p 25060 -U doadmin -d defaultdb -c "
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM \"User\" WHERE id = 'cmhjfemdh0000c0251ay2vr00') 
        THEN '✅ User EXISTS in restored database'
        ELSE '❌ User DOES NOT EXIST in restored database'
    END as user_status;
"

echo ""
echo "💡 SOLUTION:"
echo "==========="
echo "If your logged-in user doesn't exist in the restored database, you need to:"
echo "1. Log out completely"
echo "2. Log in with a user that EXISTS in the restored database"
echo "3. Users that exist: gemauck@gmail.com, gregk@abcotronics.co.za, admin@abcotronics.com, etc."
echo ""

echo "📋 Available Users to Log In With:"
PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -p 25060 -U doadmin -d defaultdb -c "
SELECT email, name, role FROM \"User\" ORDER BY role DESC, name;
"

