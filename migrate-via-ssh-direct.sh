#!/bin/bash

# Direct SSH Migration - Simpler version
# Usage: ./migrate-via-ssh-direct.sh user@host [database_name]

set -e

SSH_HOST="${1:-}"
DB_NAME="${2:-postgres}"

if [ -z "$SSH_HOST" ]; then
    echo "Usage: ./migrate-via-ssh-direct.sh user@host [database_name]"
    exit 1
fi

echo "🔧 Running migration directly via SSH on $SSH_HOST..."
echo ""

ssh "$SSH_HOST" "psql -d $DB_NAME" << 'EOF'
-- Multi-Location Inventory Migration

-- Step 1: Add locationId column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'InventoryItem' AND column_name = 'locationId'
    ) THEN
        ALTER TABLE "InventoryItem" ADD COLUMN "locationId" TEXT;
        RAISE NOTICE '✅ Added locationId column';
    ELSE
        RAISE NOTICE 'ℹ️ locationId column already exists';
    END IF;
END $$;

-- Step 2: Create index
CREATE INDEX IF NOT EXISTS "InventoryItem_locationId_idx" 
ON "InventoryItem"("locationId");
RAISE NOTICE '✅ Index created';

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
RAISE NOTICE '✅ Main Warehouse ensured';

-- Step 4: Assign existing inventory to Main Warehouse
DO $$
DECLARE
    main_warehouse_id TEXT;
    assigned_count INT;
BEGIN
    SELECT id INTO main_warehouse_id FROM "StockLocation" WHERE code = 'LOC001' LIMIT 1;
    
    IF main_warehouse_id IS NOT NULL THEN
        UPDATE "InventoryItem"
        SET "locationId" = main_warehouse_id
        WHERE ("locationId" IS NULL OR "locationId" = '');
        
        GET DIAGNOSTICS assigned_count = ROW_COUNT;
        RAISE NOTICE '✅ Assigned % items to Main Warehouse', assigned_count;
    ELSE
        RAISE NOTICE '⚠️ Main Warehouse not found - skipping assignment';
    END IF;
END $$;

-- Verification
SELECT 
    '✅✅✅ Migration Complete! ✅✅✅' as status,
    (SELECT COUNT(*) FROM "StockLocation" WHERE code = 'LOC001') as main_warehouse_exists,
    (SELECT COUNT(*) FROM "InventoryItem" WHERE "locationId" IS NOT NULL) as assigned_items,
    (SELECT COUNT(*) FROM "InventoryItem") as total_items;
EOF

echo ""
echo "✅✅✅ Migration completed! ✅✅✅"
echo ""
echo "📋 Next steps:"
echo "   1. Restart your server"
echo "   2. Test the feature in Manufacturing → Inventory Tab"

