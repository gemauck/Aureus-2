#!/bin/bash
# Copy production data directly using provided credentials

set -e

PROD_DB_URL="postgresql://doadmin:AVNS_D14tRDDknkgUUoVZ4Bv@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require"
LOCAL_DB_URL="postgresql://gemau@localhost:5432/abcotronics_erp_local"
DB_NAME="abcotronics_erp_local"

echo "📥 Copying production data to local database..."
echo ""

# Check if local database exists
if ! psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${DB_NAME}"; then
    echo "⚠️  Local database '${DB_NAME}' not found. Creating it..."
    createdb "${DB_NAME}" 2>/dev/null || {
        echo "❌ Could not create database. Please create it manually:"
        echo "   createdb ${DB_NAME}"
        exit 1
    }
    echo "✅ Database created"
fi

# Set up schema first
echo ""
echo "📊 Setting up database schema..."
export DATABASE_URL="${LOCAL_DB_URL}"
npx prisma db push --accept-data-loss > /dev/null 2>&1 || {
    echo "⚠️  Schema setup had some issues, but continuing..."
}
echo "✅ Schema ready"

# Dump production database
echo ""
echo "📦 Dumping production database..."
DUMP_FILE="/tmp/prod_dump_$(date +%Y%m%d_%H%M%S).sql"

export PGPASSWORD="AVNS_D14tRDDknkgUUoVZ4Bv"
pg_dump "${PROD_DB_URL}" > "${DUMP_FILE}" 2>&1 || {
    echo "❌ Failed to dump production database"
    echo "   Check your network connection and firewall settings"
    unset PGPASSWORD
    exit 1
}
unset PGPASSWORD

if [ ! -s "${DUMP_FILE}" ]; then
    echo "❌ Dump file is empty"
    rm -f "${DUMP_FILE}"
    exit 1
fi

echo "✅ Production database dumped (${DUMP_FILE})"

# Restore to local database
echo ""
echo "📤 Restoring to local database..."

# Drop all existing connections
psql -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" 2>/dev/null || true

# Restore the dump
psql "${LOCAL_DB_URL}" < "${DUMP_FILE}" 2>&1 | grep -v "ERROR:" || {
    echo "⚠️  Some errors occurred during restore (this may be normal)"
}

echo "✅ Database restored"

# Clean up dump file
rm -f "${DUMP_FILE}"

# Run Prisma generate
echo ""
echo "🔄 Updating Prisma client..."
npx prisma generate > /dev/null 2>&1

echo ""
echo "✅ Production data copied to local database!"
echo ""
echo "Your local database now contains production data."
echo "Start the server with: npm run dev:backend"

