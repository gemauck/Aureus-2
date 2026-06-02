-- UserSettings: inventory stock view + CRM clients status filter (idempotent)
-- Run on production if PUT /api/settings returns 500 when saving inventoryStockView.

ALTER TABLE "UserSettings"
  ADD COLUMN IF NOT EXISTS "inventoryStockView" TEXT NOT NULL DEFAULT 'all';

ALTER TABLE "UserSettings"
  ADD COLUMN IF NOT EXISTS "crmClientsStatusFilter" TEXT NOT NULL DEFAULT 'all';
