-- POA Review org settings (thresholds without code deploy)
ALTER TABLE "SystemSettings"
ADD COLUMN IF NOT EXISTS "poaReviewSettingsJson" TEXT NOT NULL DEFAULT '{}';
