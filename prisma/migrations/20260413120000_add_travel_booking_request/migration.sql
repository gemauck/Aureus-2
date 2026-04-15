-- CreateTable (idempotent: table may already exist from manual DDL or a prior partial apply)
CREATE TABLE IF NOT EXISTS "TravelBookingRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "tripTitle" TEXT NOT NULL DEFAULT '',
    "businessReason" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "assigneeInternalNotes" TEXT NOT NULL DEFAULT '',
    "messageToRequester" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelBookingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TravelBookingRequest_requesterId_idx" ON "TravelBookingRequest"("requesterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TravelBookingRequest_assigneeId_idx" ON "TravelBookingRequest"("assigneeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TravelBookingRequest_status_idx" ON "TravelBookingRequest"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TravelBookingRequest_createdAt_idx" ON "TravelBookingRequest"("createdAt");

-- AddForeignKey (skip if constraint already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TravelBookingRequest_requesterId_fkey'
  ) THEN
    ALTER TABLE "TravelBookingRequest" ADD CONSTRAINT "TravelBookingRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TravelBookingRequest_assigneeId_fkey'
  ) THEN
    ALTER TABLE "TravelBookingRequest" ADD CONSTRAINT "TravelBookingRequest_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
