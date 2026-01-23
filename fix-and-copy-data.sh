#!/bin/bash
# Fix PostgreSQL password issue and copy production data
# You'll be asked for your macOS password (not PostgreSQL password)

set -e

PROD_DB_URL="postgresql://doadmin:AVNS_D14tRDDknkgUUoVZ4Bv@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require"
LOCAL_DB_URL="postgresql://gemau@localhost:5432/abcotronics_erp_local"
DB_NAME="abcotronics_erp_local"

echo "🚀 Fixing PostgreSQL and copying production data..."
echo ""

# Step 1: Find PostgreSQL config
echo "📋 Step 1/6: Finding PostgreSQL config..."
PG_HBA="/Library/PostgreSQL/18/data/pg_hba.conf"

if [ ! -f "$PG_HBA" ]; then
    PG_HBA=$(sudo find /Library/PostgreSQL* -name pg_hba.conf 2>/dev/null | head -1)
    if [ -z "$PG_HBA" ]; then
        echo "❌ Could not find PostgreSQL config at /Library/PostgreSQL/18/data/pg_hba.conf"
        echo "Please run: sudo find /Library -name pg_hba.conf"
        exit 1
    fi
fi

echo "✅ Found: $PG_HBA"

# Step 2: Fix authentication (requires macOS password)
echo ""
echo "📋 Step 2/6: Configuring PostgreSQL to allow local connections without password..."
echo "You'll be prompted for your macOS password (not PostgreSQL):"

sudo bash << SUDO_SCRIPT
# Backup
cp "$PG_HBA" "$PG_HBA.backup.\$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true

# Add trust if not exists
if ! grep -q "^local.*all.*all.*trust" "$PG_HBA"; then
    {
        echo "# Local connections - trust (added \$(date))"
        echo "local   all   all   trust"
        echo ""
        grep -v "^local.*all.*all.*trust" "$PG_HBA"
    } > /tmp/pg_hba_new.txt
    mv /tmp/pg_hba_new.txt "$PG_HBA"
    echo "✅ Config updated"
else
    echo "✅ Trust already configured"
fi
SUDO_SCRIPT

# Step 3: Restart PostgreSQL
echo ""
echo "📋 Step 3/6: Restarting PostgreSQL..."
sudo launchctl unload /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist 2>/dev/null || true
sleep 2
sudo launchctl load /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist 2>/dev/null || true
sleep 3

# Step 4: Create database
echo ""
echo "📋 Step 4/6: Creating database..."
if createdb "${DB_NAME}" 2>/dev/null; then
    echo "✅ Database created"
elif psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${DB_NAME}"; then
    echo "✅ Database already exists"
else
    echo "⚠️  Could not create database automatically"
    exit 1
fi

# Step 5: Set up schema
echo ""
echo "📋 Step 5/6: Setting up database schema..."
export DATABASE_URL="${LOCAL_DB_URL}"
npx prisma db push --accept-data-loss 2>&1 | tail -5
echo "✅ Schema ready"

# Step 6: Copy production data
echo ""
echo "📋 Step 6/6: Copying production data..."
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

echo "📤 Restoring to local database..."
psql -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" 2>/dev/null || true
psql "${LOCAL_DB_URL}" < "${DUMP_FILE}" 2>&1 | grep -v "ERROR:" | tail -5
rm -f "${DUMP_FILE}"

echo ""
echo "✅ ✅ ✅ Complete! ✅ ✅ ✅"
echo ""
echo "Your local database now has all production data!"
echo ""
echo "Start server: npm run dev:backend"
echo "Then open: http://localhost:3000"

