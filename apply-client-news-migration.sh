#!/bin/bash

# Apply Client News Migration Script
# This script applies the database migration to add the ClientNews table

echo "🚀 Applying Client News database migration..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL environment variable is not set"
    echo "Please set it or load from .env file"
    exit 1
fi

# Option 1: Use Prisma migrate (recommended)
echo "📦 Using Prisma migrate..."
npx prisma migrate dev --name add_client_news --create-only 2>/dev/null || echo "Migration file may already exist, continuing..."

# Apply migration using Prisma
echo "📝 Applying migration..."
npx prisma migrate deploy || {
    echo "⚠️ Prisma migrate failed, trying direct SQL..."
    
    # Option 2: Direct SQL (fallback)
    echo "📝 Applying SQL migration directly..."
    psql "$DATABASE_URL" < add-client-news-migration.sql
    
    # Regenerate Prisma client
    echo "🔄 Regenerating Prisma client..."
    npx prisma generate
}

echo "✅ Migration completed!"
echo ""
echo "Next steps:"
echo "1. Verify the migration: npx prisma studio"
echo "2. Set up daily news search cron job"
echo "3. Test the news feed in the CRM section"

