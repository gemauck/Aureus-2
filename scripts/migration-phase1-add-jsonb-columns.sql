-- Phase 1: Add JSONB Columns (Safe - No Data Loss)
-- This adds NEW columns alongside existing String columns
-- Existing data remains untouched in String columns

-- Step 1: Add JSONB columns with default values (MUST RUN FIRST)
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "contactsJsonb" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "followUpsJsonb" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "commentsJsonb" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "sitesJsonb" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "contractsJsonb" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "activityLogJsonb" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "billingTermsJsonb" JSONB DEFAULT '{"paymentTerms":"Net 30","billingFrequency":"Monthly","currency":"ZAR","retainerAmount":0,"taxExempt":false,"notes":""}'::jsonb;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "proposalsJsonb" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "servicesJsonb" JSONB DEFAULT '[]'::jsonb;

-- Step 2: Add indexes on JSONB columns for better query performance (RUN AFTER COLUMNS EXIST)
CREATE INDEX IF NOT EXISTS "Client_contactsJsonb_idx" ON "Client" USING GIN ("contactsJsonb");
CREATE INDEX IF NOT EXISTS "Client_commentsJsonb_idx" ON "Client" USING GIN ("commentsJsonb");
CREATE INDEX IF NOT EXISTS "Client_sitesJsonb_idx" ON "Client" USING GIN ("sitesJsonb");
CREATE INDEX IF NOT EXISTS "Client_activityLogJsonb_idx" ON "Client" USING GIN ("activityLogJsonb");

