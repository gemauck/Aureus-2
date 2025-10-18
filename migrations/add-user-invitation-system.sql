-- Add user invitation system
-- Run this migration to add the invitation functionality

-- Add new columns to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'active';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "invitedBy" TEXT;

-- Create Invitation table
CREATE TABLE IF NOT EXISTS "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invitedBy" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- Create unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_email_key" ON "Invitation"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_token_key" ON "Invitation"("token");

-- Update existing users to have 'active' status
UPDATE "User" SET "status" = 'active' WHERE "status" IS NULL;

-- Add some sample data for testing (optional)
-- INSERT INTO "Invitation" ("id", "email", "name", "role", "token", "status", "invitedBy", "expiresAt", "createdAt", "updatedAt")
-- VALUES 
-- ('sample-inv-1', 'test@example.com', 'Test User', 'user', 'sample-token-123', 'pending', 'admin', NOW() + INTERVAL '7 days', NOW(), NOW())
-- ON CONFLICT ("email") DO NOTHING;
