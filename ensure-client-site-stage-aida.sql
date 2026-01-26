-- Ensure ClientSite has per-site lead tracking columns (siteLead, stage, aidaStatus).
-- Safe to run multiple times. Use with: psql $DATABASE_URL -f ensure-client-site-stage-aida.sql

-- PostgreSQL: add columns if they don't exist (PG 9.5+)
ALTER TABLE "ClientSite" ADD COLUMN IF NOT EXISTS "siteLead" TEXT DEFAULT '';
ALTER TABLE "ClientSite" ADD COLUMN IF NOT EXISTS "stage" TEXT DEFAULT '';
ALTER TABLE "ClientSite" ADD COLUMN IF NOT EXISTS "aidaStatus" TEXT DEFAULT '';
