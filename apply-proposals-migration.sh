#!/bin/bash
# Apply Proposals Migration SQL directly to PostgreSQL database

echo "🔧 Applying Proposals Migration SQL..."

# Check if we're running locally or on server
if [ -f ".env" ]; then
    # Load DATABASE_URL from .env
    export $(cat .env | grep -v '^#' | xargs)
    
    echo "📝 Applying migration SQL..."
    
    # Apply the migration using psql directly
    psql "$DATABASE_URL" << 'SQL'
-- Add proposals column if it doesn't exist
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "proposals" TEXT DEFAULT '[]';

-- Verify the changes
SELECT 'Proposals column added successfully' as status;
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'Client' AND column_name = 'proposals';
SQL
    
    echo "✅ Migration applied!"
else
    echo "❌ .env file not found. Please run this from the project root directory."
    exit 1
fi

