-- Add monthly progress tracking column to Project table
ALTER TABLE "Project"
ADD COLUMN IF NOT EXISTS "monthlyProgress" TEXT NOT NULL DEFAULT '{}';





