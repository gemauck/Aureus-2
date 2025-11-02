-- Migration: Add locationId to InventoryItem table for multi-location inventory support
-- This enables separate inventory for each stock location

-- Step 1: Add locationId column to InventoryItem table
ALTER TABLE "InventoryItem" 
ADD COLUMN IF NOT EXISTS "locationId" TEXT;

-- Step 2: Create index for better query performance
CREATE INDEX IF NOT EXISTS "InventoryItem_locationId_idx" ON "InventoryItem"("locationId");

-- Step 3: Ensure Main Warehouse (LOC001) exists
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

-- Step 4: Assign existing inventory items to Main Warehouse
UPDATE "InventoryItem"
SET "locationId" = (
  SELECT id FROM "StockLocation" WHERE code = 'LOC001' LIMIT 1
)
WHERE "locationId" IS NULL OR "locationId" = '';

-- Step 5: Add foreign key constraint (optional - can be done after verifying data)
-- ALTER TABLE "InventoryItem" 
-- ADD CONSTRAINT "InventoryItem_locationId_fkey" 
-- FOREIGN KEY ("locationId") REFERENCES "StockLocation"(id) ON DELETE SET NULL;

-- Verification queries:
-- SELECT COUNT(*) as total_inventory FROM "InventoryItem";
-- SELECT COUNT(*) as assigned_inventory FROM "InventoryItem" WHERE "locationId" IS NOT NULL;
-- SELECT code, name, COUNT(i.id) as item_count 
-- FROM "StockLocation" s
-- LEFT JOIN "InventoryItem" i ON i."locationId" = s.id
-- GROUP BY s.code, s.name;

