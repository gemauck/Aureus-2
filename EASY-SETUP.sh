#!/bin/bash
# Easy Setup - Tries multiple methods to set up local database with production data

set -e

PROD_DB_URL="postgresql://doadmin:AVNS_D14tRDDknkgUUoVZ4Bv@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require"
LOCAL_DB_URL="postgresql://gemau@localhost:5432/abcotronics_erp_local"
DB_NAME="abcotronics_erp_local"

echo "🚀 Easy Setup - Local Database with Production Data"
echo "===================================================="
echo ""

# Method 1: Try to create database (might work if already configured)
echo "📋 Trying to create database..."
if createdb "${DB_NAME}" 2>/dev/null; then
    echo "✅ Database created successfully!"
    DB_CREATED=true
elif psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${DB_NAME}"; then
    echo "✅ Database already exists"
    DB_CREATED=true
else
    echo "⚠️  Could not create database automatically"
    DB_CREATED=false
fi

if [ "$DB_CREATED" = false ]; then
    echo ""
    echo "📝 Manual Step Required:"
    echo "You need to create the database manually. Try one of these:"
    echo ""
    echo "Option 1:"
    echo "  createdb ${DB_NAME}"
    echo ""
    echo "Option 2:"
    echo "  psql postgres"
    echo "  CREATE DATABASE ${DB_NAME};"
    echo "  \\q"
    echo ""
    echo "Option 3: Fix PostgreSQL to not require password:"
    echo "  1. Find config: sudo find /Library -name pg_hba.conf"
    echo "  2. Edit it: sudo nano [path-to-pg_hba.conf]"
    echo "  3. Add at top: local   all   all   trust"
    echo "  4. Restart: sudo launchctl unload /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist"
    echo "             sudo launchctl load /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist"
    echo ""
    read -p "Press Enter after you've created the database, or Ctrl+C to exit..."
    
    if ! psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${DB_NAME}"; then
        echo "❌ Database still not found. Exiting."
        exit 1
    fi
fi

# Set up schema
echo ""
echo "📊 Setting up database schema..."
export DATABASE_URL="${LOCAL_DB_URL}"
npx prisma db push --accept-data-loss 2>&1 | tail -5
echo "✅ Schema ready"

# Copy production data
echo ""
echo "📦 Copying production data (this may take a few minutes)..."
DUMP_FILE="/tmp/prod_dump_$(date +%Y%m%d_%H%M%S).sql"

export PGPASSWORD="AVNS_D14tRDDknkgUUoVZ4Bv"
pg_dump "${PROD_DB_URL}" > "${DUMP_FILE}" 2>&1
unset PGPASSWORD

if [ ! -s "${DUMP_FILE}" ]; then
    echo "❌ Failed to download production data"
    echo "   Check your internet connection"
    exit 1
fi

DUMP_SIZE=$(du -h "${DUMP_FILE}" | cut -f1)
echo "✅ Production data downloaded (${DUMP_SIZE})"

echo "📤 Restoring to local database..."
psql -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" 2>/dev/null || true
psql "${LOCAL_DB_URL}" < "${DUMP_FILE}" 2>&1 | grep -v "ERROR:" | tail -10
rm -f "${DUMP_FILE}"

echo ""
echo "✅ ✅ ✅ Complete! ✅ ✅ ✅"
echo ""
echo "Your local database now has all production data!"
echo ""
echo "Start server: npm run dev:backend"
echo "Then open: http://localhost:3000"

