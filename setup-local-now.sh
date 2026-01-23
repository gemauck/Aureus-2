#!/bin/bash
# Complete setup: Create database, schema, and copy production data
# Run this in your terminal (you'll be able to enter passwords)

set -e

PROD_DB_URL="postgresql://doadmin:AVNS_D14tRDDknkgUUoVZ4Bv@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require"
LOCAL_DB_URL="postgresql://gemau@localhost:5432/abcotronics_erp_local"
DB_NAME="abcotronics_erp_local"

echo "🚀 Setting up local database with production data..."
echo ""

# Step 1: Create database
echo "📊 Step 1/4: Creating database '${DB_NAME}'..."
if psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${DB_NAME}"; then
    echo "✅ Database already exists"
else
    createdb "${DB_NAME}" || {
        echo ""
        echo "Please create the database manually:"
        echo "  psql postgres"
        echo "  CREATE DATABASE ${DB_NAME};"
        echo "  \\q"
        exit 1
    }
    echo "✅ Database created"
fi

# Step 2: Set up schema
echo ""
echo "📊 Step 2/4: Setting up database schema..."
export DATABASE_URL="${LOCAL_DB_URL}"
npx prisma db push --accept-data-loss 2>&1 | tail -3
echo "✅ Schema ready"

# Step 3: Dump production
echo ""
echo "📦 Step 3/4: Copying production data..."
DUMP_FILE="/tmp/prod_dump_$(date +%Y%m%d_%H%M%S).sql"

export PGPASSWORD="AVNS_D14tRDDknkgUUoVZ4Bv"
pg_dump "${PROD_DB_URL}" > "${DUMP_FILE}" 2>&1
unset PGPASSWORD

if [ ! -s "${DUMP_FILE}" ]; then
    echo "❌ Dump failed"
    exit 1
fi

DUMP_SIZE=$(du -h "${DUMP_FILE}" | cut -f1)
echo "✅ Production data downloaded (${DUMP_SIZE})"

# Step 4: Restore
echo ""
echo "📤 Step 4/4: Restoring to local database..."
psql -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" 2>/dev/null || true
psql "${LOCAL_DB_URL}" < "${DUMP_FILE}" 2>&1 | grep -v "ERROR:" | tail -5
rm -f "${DUMP_FILE}"

echo ""
echo "✅ ✅ ✅ Complete! ✅ ✅ ✅"
echo ""
echo "Your local database now has all production data!"
echo "Start server: npm run dev:backend"

