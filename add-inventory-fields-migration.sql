-- Safe migration to add Supplier Part Numbers and Legacy Part Number fields to InventoryItem
-- For SQLite (most common case)

-- Add supplierPartNumbers column (will fail silently if already exists - that's okay)
ALTER TABLE "InventoryItem" ADD COLUMN "supplierPartNumbers" TEXT DEFAULT '[]';

-- Add legacyPartNumber column (will fail silently if already exists - that's okay)
ALTER TABLE "InventoryItem" ADD COLUMN "legacyPartNumber" TEXT DEFAULT '';

-- Note: SQLite doesn't support IF NOT EXISTS in ALTER TABLE
-- If columns already exist, these commands will show an error but won't break anything
-- The migration script checks for column existence before running these commands
