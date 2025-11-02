#!/bin/bash

# Apply Client News Migration via SSH
# This script connects to the production server and runs the migration

# Configuration
SERVER_IP="${SERVER_IP:-165.22.127.196}"
SERVER_USER="${SERVER_USER:-root}"
APP_DIR="${APP_DIR:-/var/www/abcotronics-erp}"

echo "🚀 Applying Client News migration via SSH..."
echo "📡 Server: $SERVER_USER@$SERVER_IP"
echo "📁 App Directory: $APP_DIR"
echo ""

# Check if migration file exists locally
if [ ! -f "add-client-news-migration.sql" ]; then
    echo "❌ Migration file not found: add-client-news-migration.sql"
    exit 1
fi

# Copy migration file to server and execute
ssh $SERVER_USER@$SERVER_IP << ENDSSH
set -e

echo "✅ Connected to server"

# Navigate to app directory
cd $APP_DIR || { echo "❌ App directory not found: $APP_DIR"; exit 1; }

echo "📦 Checking for migration file..."

# Method 1: Use Prisma migrate (recommended if Prisma is set up)
if [ -f "prisma/schema.prisma" ]; then
    echo "📝 Using Prisma migrate..."
    
    # Check if migration already exists
    if [ -d "prisma/migrations" ] && ls prisma/migrations/*/migration.sql 2>/dev/null | grep -q "ClientNews"; then
        echo "⚠️  ClientNews migration already exists in Prisma migrations"
        echo "🔄 Applying existing migrations..."
        npx prisma migrate deploy || {
            echo "⚠️  Prisma migrate deploy failed, trying db push..."
            npx prisma db push --accept-data-loss || {
                echo "❌ Prisma operations failed"
                exit 1
            }
        }
    else
        echo "📝 Creating new migration..."
        # Create migration
        npx prisma migrate dev --name add_client_news --create-only 2>/dev/null || echo "Migration may already exist"
        
        # Or use db push for development
        echo "🔄 Pushing schema changes..."
        npx prisma db push --accept-data-loss || {
            echo "❌ Prisma db push failed"
            exit 1
        }
    fi
    
    echo "🔄 Regenerating Prisma client..."
    npx prisma generate || echo "⚠️  Prisma generate failed (may already be up to date)"
    
    echo "✅ Prisma migration completed"
else
    echo "⚠️  Prisma not found, trying direct SQL..."
    
    # Method 2: Direct SQL execution
    if command -v psql &> /dev/null; then
        echo "📝 Running SQL migration directly..."
        
        # Get DATABASE_URL from environment
        if [ -z "\$DATABASE_URL" ]; then
            if [ -f ".env" ]; then
                export \$(grep -v '^#' .env | xargs)
            else
                echo "❌ DATABASE_URL not found in environment or .env file"
                exit 1
            fi
        fi
        
        # Run migration SQL
        psql "\$DATABASE_URL" << 'SQL'
-- Migration: Add ClientNews table
CREATE TABLE IF NOT EXISTS "ClientNews" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'Unknown',
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isNew" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientNews_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraint
DO \$f\$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'ClientNews_clientId_fkey'
    ) THEN
        ALTER TABLE "ClientNews" 
        ADD CONSTRAINT "ClientNews_clientId_fkey" 
        FOREIGN KEY ("clientId") 
        REFERENCES "Client"("id") 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
    END IF;
END \$f\$;

-- Create indexes
CREATE INDEX IF NOT EXISTS "ClientNews_clientId_idx" ON "ClientNews"("clientId");
CREATE INDEX IF NOT EXISTS "ClientNews_publishedAt_idx" ON "ClientNews"("publishedAt");
CREATE INDEX IF NOT EXISTS "ClientNews_isNew_idx" ON "ClientNews"("isNew");
CREATE INDEX IF NOT EXISTS "ClientNews_createdAt_idx" ON "ClientNews"("createdAt");

-- Add comments
COMMENT ON TABLE "ClientNews" IS 'Stores daily news articles fetched for clients';
COMMENT ON COLUMN "ClientNews"."isNew" IS 'True if article was published within last 24 hours';
SQL

        if [ \$? -eq 0 ]; then
            echo "✅ SQL migration completed successfully"
            
            # Regenerate Prisma client if Prisma exists
            if [ -f "package.json" ] && grep -q "prisma" package.json; then
                echo "🔄 Regenerating Prisma client..."
                npx prisma generate || echo "⚠️  Prisma generate failed"
            fi
        else
            echo "❌ SQL migration failed"
            exit 1
        fi
    else
        echo "❌ psql not found. Cannot run SQL migration."
        echo "💡 Install PostgreSQL client or use Prisma"
        exit 1
    fi
fi

echo ""
echo "✅ Migration completed successfully!"
echo ""
echo "📋 Verification:"
echo "   Run this to verify the table was created:"
echo "   npx prisma studio"
echo "   or"
echo "   psql \$DATABASE_URL -c \"\\dt ClientNews\""

ENDSSH

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration applied successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Verify the migration: SSH into server and check the table"
    echo "2. Restart the application if needed"
    echo "3. Test the News Feed feature in the CRM section"
else
    echo ""
    echo "❌ Migration failed. Check the error messages above."
    exit 1
fi

