-- Catalog: latest inbound unit price (separate from weighted-average unitCost).
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "lastInboundUnitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "lastInboundAt" TIMESTAMP(3);
