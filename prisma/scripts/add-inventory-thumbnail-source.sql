-- Add thumbnailSource to InventoryItem (manual vs AI-suggested images).
-- Run: psql $DATABASE_URL -f prisma/scripts/add-inventory-thumbnail-source.sql

ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "thumbnailSource" TEXT NOT NULL DEFAULT '';
