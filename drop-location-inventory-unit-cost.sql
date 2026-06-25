-- Remove per-location unit cost (catalog InventoryItem.unitCost is the single price per SKU).
ALTER TABLE "LocationInventory" DROP COLUMN IF EXISTS "unitCost";
