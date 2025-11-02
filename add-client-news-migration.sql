-- Migration: Add ClientNews table for storing daily news articles
-- This migration adds the ClientNews model to store news articles fetched for clients

-- Create ClientNews table
CREATE TABLE IF NOT EXISTS "ClientNews" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'Unknown',
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isNew" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientNews_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraint
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'ClientNews_clientId_fkey'
    ) THEN
        ALTER TABLE "ClientNews" 
        ADD CONSTRAINT "ClientNews_clientId_fkey" 
        FOREIGN KEY ("clientId") 
        REFERENCES "Client"("id") 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS "ClientNews_clientId_idx" ON "ClientNews"("clientId");
CREATE INDEX IF NOT EXISTS "ClientNews_publishedAt_idx" ON "ClientNews"("publishedAt");
CREATE INDEX IF NOT EXISTS "ClientNews_isNew_idx" ON "ClientNews"("isNew");
CREATE INDEX IF NOT EXISTS "ClientNews_createdAt_idx" ON "ClientNews"("createdAt");

-- Add newsArticles relation to Client (already exists if using Prisma, but safe to verify)
-- Note: This is handled by Prisma relations, but we ensure the foreign key exists above

COMMENT ON TABLE "ClientNews" IS 'Stores daily news articles fetched for clients';
COMMENT ON COLUMN "ClientNews"."isNew" IS 'True if article was published within last 24 hours';

