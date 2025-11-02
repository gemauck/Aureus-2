-- Migration: Add RSS subscription field to Client table
-- This allows clients/leads to subscribe/unsubscribe from news feeds

-- Add rssSubscribed column (defaults to true - all existing clients are subscribed)
ALTER TABLE "Client" 
ADD COLUMN IF NOT EXISTS "rssSubscribed" BOOLEAN DEFAULT true;

-- Update existing clients to be subscribed by default (if null)
UPDATE "Client" 
SET "rssSubscribed" = true 
WHERE "rssSubscribed" IS NULL;

-- Add comment
COMMENT ON COLUMN "Client"."rssSubscribed" IS 'Whether this client/lead is subscribed to RSS news feed (default: true)';

