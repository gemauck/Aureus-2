-- Add KYC columns to Client table for Know Your Customer (KYC) data
-- Safe to run with IF NOT EXISTS (PostgreSQL 9.5+)
-- Run with: psql $DATABASE_URL -f add-kyc-migration.sql

-- Add kyc text column (stores JSON string, same pattern as billingTerms)
ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS kyc TEXT DEFAULT '{}';

-- Add kycJsonb for JSONB storage (optional, for querying/filtering)
ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "kycJsonb" JSONB DEFAULT '{}';

-- Backfill kycJsonb from kyc where we have string data and jsonb is null (optional)
-- UPDATE "Client" SET "kycJsonb" = kyc::jsonb WHERE "kycJsonb" IS NULL AND kyc IS NOT NULL AND kyc != '';
