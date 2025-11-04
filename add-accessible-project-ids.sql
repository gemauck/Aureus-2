-- Safe Migration Script: Add accessibleProjectIds to User table
-- This script safely adds the column only if it doesn't exist
-- It preserves all existing data and sets a safe default

-- Step 1: Check if column exists, if not add it
DO $$
BEGIN
    -- Check if the column already exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'User' 
        AND column_name = 'accessibleProjectIds'
    ) THEN
        -- Add the column with a safe default value
        ALTER TABLE "User" ADD COLUMN "accessibleProjectIds" TEXT DEFAULT '[]';
        
        -- Update any NULL values to the default empty array
        UPDATE "User" 
        SET "accessibleProjectIds" = '[]' 
        WHERE "accessibleProjectIds" IS NULL;
        
        RAISE NOTICE 'Column accessibleProjectIds added successfully';
    ELSE
        RAISE NOTICE 'Column accessibleProjectIds already exists, skipping';
    END IF;
END $$;

-- Step 2: Verify the column was added correctly
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'User' 
AND column_name = 'accessibleProjectIds';
