-- Migration: Add inventoryItemId to BOM table
-- This links every BOM to its finished product inventory item
-- Run this migration before deploying the code changes

-- Step 1: Add the inventoryItemId column (nullable initially for existing BOMs)
ALTER TABLE "BOM" 
ADD COLUMN IF NOT EXISTS "inventoryItemId" TEXT;

-- Step 2: Create index for performance
CREATE INDEX IF NOT EXISTS "BOM_inventoryItemId_idx" ON "BOM"("inventoryItemId");

-- Step 3: Add foreign key constraint (optional, but recommended for data integrity)
-- Note: This will fail if there are existing BOMs with invalid inventoryItemId values
-- If you need to handle existing data, uncomment and modify as needed:
-- ALTER TABLE "BOM"
-- ADD CONSTRAINT "BOM_inventoryItemId_fkey" 
-- FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Verification query: Check for BOMs without inventoryItemId
-- SELECT id, "productSku", "productName", "inventoryItemId" 
-- FROM "BOM" 
-- WHERE "inventoryItemId" IS NULL;

