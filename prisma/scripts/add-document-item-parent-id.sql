-- Add parentId to DocumentItem for sub-document hierarchy
-- Run this manually if prisma migrate deploy is blocked by a failed migration:
--   psql $DATABASE_URL -f prisma/scripts/add-document-item-parent-id.sql
-- Or execute the statements below in your SQL client.

-- Add column (idempotent)
ALTER TABLE "DocumentItem" ADD COLUMN IF NOT EXISTS "parentId" TEXT;

-- Index for lookups
CREATE INDEX IF NOT EXISTS "DocumentItem_parentId_idx" ON "DocumentItem"("parentId");

-- Foreign key (skip if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DocumentItem_parentId_fkey'
  ) THEN
    ALTER TABLE "DocumentItem" ADD CONSTRAINT "DocumentItem_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "DocumentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
