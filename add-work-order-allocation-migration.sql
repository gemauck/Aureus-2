-- Migration: Add work order stock allocation and status workflow
-- Date: 2025-11-01

-- Add allocatedQuantity column to InventoryItem table
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "allocatedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Update ProductionOrder status default to 'requested'
ALTER TABLE "ProductionOrder" ALTER COLUMN "status" SET DEFAULT 'requested';

-- Note: The status column already supports 'requested', 'in_production', 'completed', 'cancelled'
-- No constraint changes needed as it's already a text field

