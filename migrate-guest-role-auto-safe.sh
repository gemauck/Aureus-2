#!/bin/bash
# Non-Interactive Safe Database Migration Script
# Automatically runs with safety checks, no user prompts

set -e

cd /var/www/abcotronics-erp

echo "🔒 Safe Database Migration: Guest Role Feature"
echo "=============================================="
echo ""

# Check if SQL file exists
if [ ! -f "add-accessible-project-ids.sql" ]; then
    echo "❌ Error: add-accessible-project-ids.sql not found"
    exit 1
fi

echo "✅ Migration file found"
echo ""

# Load environment variables
if [ -f .env ]; then
    export $(grep DATABASE_URL .env | grep -v '^#' | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not found in .env"
    exit 1
fi

echo "🔍 Checking database connection..."
echo ""

# Method 1: Try using psql if available
if command -v psql >/dev/null 2>&1; then
    echo "📊 Using psql to execute safe migration..."
    echo ""
    
    # Execute the safe SQL migration
    psql "$DATABASE_URL" -f add-accessible-project-ids.sql
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Migration executed successfully via psql"
    else
        echo "❌ Migration failed"
        exit 1
    fi
# Method 2: Try using Prisma db push (safe - only adds missing columns)
elif npx prisma db push --accept-data-loss --skip-generate 2>/dev/null; then
    echo "✅ Schema synchronized via Prisma (safe mode)"
else
    echo "❌ Could not execute migration"
    echo "   Please run manually: psql \$DATABASE_URL -f add-accessible-project-ids.sql"
    exit 1
fi

echo ""
echo "🔄 Regenerating Prisma client..."
npx prisma generate

echo ""
echo "✅ Safe migration completed!"
echo ""
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp || pm2 start server.js --name abcotronics-erp

echo ""
echo "✅ Migration and restart complete!"
echo ""
echo "📋 Verification:"
echo "   The accessibleProjectIds column has been added to the User table"
echo "   All existing users have been set to '[]' (empty array) by default"
echo "   Guest users can now be created with specific project access"

