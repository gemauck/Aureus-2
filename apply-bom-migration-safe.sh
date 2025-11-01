#!/bin/bash
# Safe migration script for adding inventoryItemId to BOM table
# This script is backward-compatible and won't break existing functionality

set -e  # Exit on error

echo "🔧 Applying BOM inventoryItemId migration..."
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found. Make sure DATABASE_URL is set."
    exit 1
fi

# Source .env to get DATABASE_URL
export $(cat .env | grep -v '^#' | xargs)

if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL not found in .env file"
    exit 1
fi

echo "📋 Migration Steps:"
echo "1. Adding inventoryItemId column (nullable - safe for existing BOMs)"
echo "2. Creating index for performance"
echo ""

# Apply migration using psql or Prisma
if command -v psql &> /dev/null; then
    echo "✅ Using psql to apply migration..."
    psql "$DATABASE_URL" << EOF
-- Add the inventoryItemId column (nullable initially for existing BOMs)
ALTER TABLE "BOM" 
ADD COLUMN IF NOT EXISTS "inventoryItemId" TEXT;

-- Create index for performance
CREATE INDEX IF NOT EXISTS "BOM_inventoryItemId_idx" ON "BOM"("inventoryItemId");

-- Verify
SELECT COUNT(*) as total_boms, 
       COUNT("inventoryItemId") as boms_with_inventory_item
FROM "BOM";
EOF
    echo ""
    echo "✅ Migration applied successfully!"
elif command -v npx &> /dev/null; then
    echo "✅ Using Prisma to apply migration..."
    npx prisma migrate deploy
    echo ""
    echo "✅ Migration applied successfully!"
else
    echo "❌ Error: Neither psql nor npx found. Please install PostgreSQL client or Node.js"
    exit 1
fi

echo ""
echo "🎉 Migration complete! Your server should work normally."
echo "📝 Note: Existing BOMs will continue to work. New BOMs require inventoryItemId."

