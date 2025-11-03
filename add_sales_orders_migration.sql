-- Migration: Add SalesOrder table
-- Compatible with both SQLite (local dev) and PostgreSQL (production)

-- CreateTable
CREATE TABLE IF NOT EXISTS "SalesOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL UNIQUE,
    "clientId" TEXT,
    "clientName" TEXT NOT NULL DEFAULT '',
    "opportunityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "orderDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requiredDate" DATETIME,
    "shippedDate" DATETIME,
    "subtotal" REAL NOT NULL DEFAULT 0,
    "tax" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "items" TEXT NOT NULL DEFAULT '[]',
    "shippingAddress" TEXT NOT NULL DEFAULT '',
    "shippingMethod" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "ownerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesOrder_clientId_idx" ON "SalesOrder"("clientId");
CREATE INDEX IF NOT EXISTS "SalesOrder_status_idx" ON "SalesOrder"("status");
CREATE INDEX IF NOT EXISTS "SalesOrder_ownerId_idx" ON "SalesOrder"("ownerId");
CREATE INDEX IF NOT EXISTS "SalesOrder_opportunityId_idx" ON "SalesOrder"("opportunityId");
CREATE UNIQUE INDEX IF NOT EXISTS "SalesOrder_orderNumber_key" ON "SalesOrder"("orderNumber");

