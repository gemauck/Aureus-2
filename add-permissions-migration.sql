-- Migration: Add permissions field to User table
-- This migration adds a permissions column to store custom permissions that override role-based permissions
-- Run this after updating the Prisma schema and generating a new migration

-- Add permissions column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'User' 
        AND column_name = 'permissions'
    ) THEN
        ALTER TABLE "User" ADD COLUMN "permissions" TEXT DEFAULT '[]';
        RAISE NOTICE 'Added permissions column to User table';
    ELSE
        RAISE NOTICE 'permissions column already exists in User table';
    END IF;
END $$;

-- Set default value for existing users (empty array)
UPDATE "User" SET "permissions" = '[]' WHERE "permissions" IS NULL;

