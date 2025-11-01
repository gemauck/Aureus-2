-- Add thumbnail and instructions fields to BOM table
ALTER TABLE "BOM" 
ADD COLUMN IF NOT EXISTS "thumbnail" TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS "instructions" TEXT DEFAULT '';

