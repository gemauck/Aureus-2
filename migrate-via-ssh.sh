#!/bin/bash

# SSH Migration Script for Multi-Location Inventory
# Usage: ./migrate-via-ssh.sh [user@host] [database_name]

set -e

SSH_HOST="${1:-}"
DB_NAME="${2:-}"

if [ -z "$SSH_HOST" ]; then
    echo "❌ Usage: ./migrate-via-ssh.sh [user@host] [database_name]"
    echo ""
    echo "Example: ./migrate-via-ssh.sh user@example.com my_database"
    echo "Or: ./migrate-via-ssh.sh root@192.168.1.100 abcotronics_db"
    exit 1
fi

echo "🔧 Running migration via SSH..."
echo "📡 Connecting to: $SSH_HOST"
echo ""

# Create SQL migration file
cat > /tmp/migration.sql << 'EOF'
-- Multi-Location Inventory Migration
-- Add locationId column to InventoryItem table

BEGIN;

-- Step 1: Add locationId column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'InventoryItem' AND column_name = 'locationId'
    ) THEN
        ALTER TABLE "InventoryItem" ADD COLUMN "locationId" TEXT;
        RAISE NOTICE 'Added locationId column';
    ELSE
        RAISE NOTICE 'locationId column already exists';
    END IF;
END $$;

-- Step 2: Create index
CREATE INDEX IF NOT EXISTS "InventoryItem_locationId_idx" 
ON "InventoryItem"("locationId");

-- Step 3: Ensure Main Warehouse exists
INSERT INTO "StockLocation" (id, code, name, type, status, address, "contactPerson", "contactPhone", meta, "createdAt", "updatedAt")
SELECT 
    gen_random_uuid()::text,
    'LOC001',
    'Main Warehouse',
    'warehouse',
    'active',
    '',
    '',
    '',
    '{}',
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM "StockLocation" WHERE code = 'LOC001'
);

-- Step 4: Assign existing inventory to Main Warehouse
UPDATE "InventoryItem"
SET "locationId" = (
    SELECT id FROM "StockLocation" WHERE code = 'LOC001' LIMIT 1
)
WHERE ("locationId" IS NULL OR "locationId" = '')
  AND EXISTS (SELECT 1 FROM "StockLocation" WHERE code = 'LOC001');

COMMIT;

-- Verification
SELECT 
    'Migration Complete!' as status,
    (SELECT COUNT(*) FROM "StockLocation" WHERE code = 'LOC001') as main_warehouse_exists,
    (SELECT COUNT(*) FROM "InventoryItem" WHERE "locationId" IS NOT NULL) as assigned_items,
    (SELECT COUNT(*) FROM "InventoryItem") as total_items;
EOF

echo "📋 Migration SQL prepared"
echo "📤 Uploading to server..."

# Upload SQL file to server
scp /tmp/migration.sql "$SSH_HOST:/tmp/migration.sql"

echo "✅ SQL file uploaded"
echo "🚀 Running migration on server..."

if [ -n "$DB_NAME" ]; then
    # If database name provided, use it
    ssh "$SSH_HOST" "psql -d $DB_NAME -f /tmp/migration.sql"
else
    # Try to detect database from environment or use default
    ssh "$SSH_HOST" "cd /path/to/your/app && psql \$DATABASE_URL -f /tmp/migration.sql || psql postgres -f /tmp/migration.sql"
fi

echo ""
echo "✅✅✅ Migration completed via SSH! ✅✅✅"
echo ""
echo "📋 Next steps:"
echo "   1. Restart your server on $SSH_HOST"
echo "   2. Go to Manufacturing → Inventory Tab"
echo "   3. Use the location selector dropdown"

# Cleanup
rm /tmp/migration.sql
ssh "$SSH_HOST" "rm /tmp/migration.sql" 2>/dev/null || true

