-- QuickBooks Online receipt capture sync (idempotent)

CREATE TABLE IF NOT EXISTS "QuickBooksConnection" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "realmId" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "companyName" TEXT NOT NULL DEFAULT '',
    "defaultPaymentAccountId" TEXT NOT NULL DEFAULT '',
    "connectedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickBooksConnection_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ReceiptAccount" ADD COLUMN IF NOT EXISTS "qboAccountId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ReceiptCostCenter" ADD COLUMN IF NOT EXISTS "qboClassId" TEXT NOT NULL DEFAULT '';

ALTER TABLE "ReceiptDocument" ADD COLUMN IF NOT EXISTS "qboPurchaseId" TEXT;
ALTER TABLE "ReceiptDocument" ADD COLUMN IF NOT EXISTS "qboSyncedAt" TIMESTAMP(3);
ALTER TABLE "ReceiptDocument" ADD COLUMN IF NOT EXISTS "qboSyncError" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "ReceiptDocument_qboPurchaseId_idx" ON "ReceiptDocument"("qboPurchaseId");
