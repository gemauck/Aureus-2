-- Per-user email preference for ERP Messenger (default off)
ALTER TABLE "NotificationSetting"
  ADD COLUMN IF NOT EXISTS "emailMessages" BOOLEAN NOT NULL DEFAULT false;
