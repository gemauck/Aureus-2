-- Stock transfer request workflow + location responsible user (idempotent).

ALTER TABLE "StockLocation"
    ADD COLUMN IF NOT EXISTS "responsibleUserId" TEXT;

CREATE INDEX IF NOT EXISTS "StockLocation_responsibleUserId_idx"
    ON "StockLocation"("responsibleUserId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'StockLocation_responsibleUserId_fkey'
    ) THEN
        ALTER TABLE "StockLocation"
            ADD CONSTRAINT "StockLocation_responsibleUserId_fkey"
            FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "StockTransferRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestRef" TEXT NOT NULL UNIQUE,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "fromLocationCode" TEXT NOT NULL DEFAULT '',
    "fromLocationName" TEXT NOT NULL DEFAULT '',
    "toLocationCode" TEXT NOT NULL DEFAULT '',
    "toLocationName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending_approval',
    "requestedById" TEXT NOT NULL DEFAULT '',
    "requestedBy" TEXT NOT NULL DEFAULT '',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT NOT NULL DEFAULT '',
    "reviewedById" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT NOT NULL DEFAULT '',
    "stockMovementIds" TEXT NOT NULL DEFAULT '[]',
    "meta" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "StockTransferRequest_status_idx"
    ON "StockTransferRequest"("status");
CREATE INDEX IF NOT EXISTS "StockTransferRequest_fromLocationId_idx"
    ON "StockTransferRequest"("fromLocationId");
CREATE INDEX IF NOT EXISTS "StockTransferRequest_toLocationId_idx"
    ON "StockTransferRequest"("toLocationId");
CREATE INDEX IF NOT EXISTS "StockTransferRequest_requestedById_idx"
    ON "StockTransferRequest"("requestedById");
CREATE INDEX IF NOT EXISTS "StockTransferRequest_requestedAt_idx"
    ON "StockTransferRequest"("requestedAt");

CREATE TABLE IF NOT EXISTS "StockTransferRequestLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "locationInventoryId" TEXT,
    "sku" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockTransferRequestLine_requestId_fkey"
        FOREIGN KEY ("requestId") REFERENCES "StockTransferRequest"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "StockTransferRequestLine_requestId_idx"
    ON "StockTransferRequestLine"("requestId");
CREATE INDEX IF NOT EXISTS "StockTransferRequestLine_sku_idx"
    ON "StockTransferRequestLine"("sku");
