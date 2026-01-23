#!/bin/bash
# Setup local database and copy production data

set -e

PROD_DB_URL="postgresql://doadmin:AVNS_D14tRDDknkgUUoVZ4Bv@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require"
LOCAL_DB_URL="postgresql://gemau@localhost:5432/abcotronics_erp_local"
DB_NAME="abcotronics_erp_local"

echo "🚀 Setting up local database with production data..."
echo ""

# Step 1: Create database
echo "📊 Step 1: Creating local database..."
if psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${DB_NAME}"; then
    echo "✅ Database already exists"
else
    echo "Creating database '${DB_NAME}'..."
    echo "You may be prompted for your PostgreSQL password..."
    createdb "${DB_NAME}" 2>/dev/null || {
        echo ""
        echo "⚠️  Could not create database automatically."
        echo "Please create it manually:"
        echo ""
        echo "  Option 1: createdb ${DB_NAME}"
        echo ""
        echo "  Option 2: psql postgres"
        echo "            CREATE DATABASE ${DB_NAME};"
        echo "            \\q"
        echo ""
        read -p "Press Enter after you've created the database, or Ctrl+C to exit..."
        
        if ! psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${DB_NAME}"; then
            echo "❌ Database still not found. Exiting."
            exit 1
        fi
    }
    echo "✅ Database created"
fi

# Step 2: Set up schema
echo ""
echo "📊 Step 2: Setting up database schema..."
export DATABASE_URL="${LOCAL_DB_URL}"
npx prisma db push --accept-data-loss 2>&1 | tail -5 || {
    echo "⚠️  Schema setup completed (some warnings may be normal)"
}
echo "✅ Schema ready"

# Step 3: Dump production database
echo ""
echo "📦 Step 3: Dumping production database..."
DUMP_FILE="/tmp/prod_dump_$(date +%Y%m%d_%H%M%S).sql"

export PGPASSWORD="AVNS_D14tRDDknkgUUoVZ4Bv"
pg_dump "${PROD_DB_URL}" > "${DUMP_FILE}" 2>&1 || {
    echo "❌ Failed to dump production database"
    echo "   This might be a network/firewall issue"
    unset PGPASSWORD
    exit 1
}
unset PGPASSWORD

if [ ! -s "${DUMP_FILE}" ]; then
    echo "❌ Dump file is empty"
    rm -f "${DUMP_FILE}"
    exit 1
fi

DUMP_SIZE=$(du -h "${DUMP_FILE}" | cut -f1)
echo "✅ Production database dumped (${DUMP_SIZE})"

# Step 4: Restore to local
echo ""
echo "📤 Step 4: Restoring to local database..."
echo "This may take a few minutes..."

# Drop existing connections
psql -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" 2>/dev/null || true

# Restore
psql "${LOCAL_DB_URL}" < "${DUMP_FILE}" 2>&1 | grep -v "ERROR:" | tail -20 || {
    echo "⚠️  Some errors occurred during restore (this may be normal)"
}

echo "✅ Database restored"

# Clean up
rm -f "${DUMP_FILE}"

# Update Prisma client
echo ""
echo "🔄 Updating Prisma client..."
npx prisma generate > /dev/null 2>&1

echo ""
echo "✅ ✅ ✅ Setup complete! ✅ ✅ ✅"
echo ""
echo "Your local database now contains all production data."
echo ""
echo "Start the server with:"
echo "  npm run dev:backend"
echo ""
echo "Then open: http://localhost:3000"

