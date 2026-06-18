-- Add GPS coordinates to normalized ClientSite rows (map picker + manual entry).
ALTER TABLE "ClientSite" ADD COLUMN IF NOT EXISTS "latitude" TEXT DEFAULT '';
ALTER TABLE "ClientSite" ADD COLUMN IF NOT EXISTS "longitude" TEXT DEFAULT '';
