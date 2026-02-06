-- Migration: Add DocumentRequestEmailReceived table for inbound idempotency
-- Purpose: prevent duplicate "Email from Client" comments when Resend retries webhooks

CREATE TABLE IF NOT EXISTS "DocumentRequestEmailReceived" (
  "id" TEXT NOT NULL,
  "emailId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentRequestEmailReceived_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DocumentRequestEmailReceived_emailId_key" UNIQUE ("emailId")
);

CREATE INDEX IF NOT EXISTS "DocumentRequestEmailReceived_project_doc_month_idx"
  ON "DocumentRequestEmailReceived" ("projectId", "documentId", "year", "month");

CREATE INDEX IF NOT EXISTS "DocumentRequestEmailReceived_createdAt_idx"
  ON "DocumentRequestEmailReceived" ("createdAt");
