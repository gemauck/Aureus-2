#!/bin/bash

# Apply RSS Subscription Migration via SSH
SERVER_IP="${SERVER_IP:-165.22.127.196}"
SERVER_USER="${SERVER_USER:-root}"
APP_DIR="${APP_DIR:-/var/www/abcotronics-erp}"

echo "🚀 Applying RSS subscription migration via SSH..."
echo "📡 Server: $SERVER_USER@$SERVER_IP"

ssh $SERVER_USER@$SERVER_IP << ENDSSH
set -e

cd $APP_DIR || { echo "❌ App directory not found"; exit 1; }

echo "✅ Connected to server"

# Method 1: Use Prisma
if [ -f "prisma/schema.prisma" ]; then
    echo "📝 Using Prisma db push..."
    
    # Copy updated schema
    echo "📦 Schema already synced, pushing to database..."
    npx prisma db push --accept-data-loss || {
        echo "⚠️ Prisma push failed, trying SQL..."
        
        # Method 2: Direct SQL
        if command -v psql &> /dev/null || [ -n "\$DATABASE_URL" ]; then
            echo "📝 Running SQL migration directly..."
            
            if [ -z "\$DATABASE_URL" ] && [ -f ".env" ]; then
                export \$(grep -v '^#' .env | xargs)
            fi
            
            if [ -n "\$DATABASE_URL" ]; then
                psql "\$DATABASE_URL" << 'SQL'
-- Add rssSubscribed column
ALTER TABLE "Client" 
ADD COLUMN IF NOT EXISTS "rssSubscribed" BOOLEAN DEFAULT true;

-- Update existing clients to be subscribed by default
UPDATE "Client" 
SET "rssSubscribed" = true 
WHERE "rssSubscribed" IS NULL;
SQL
                
                echo "✅ SQL migration completed"
            else
                echo "❌ DATABASE_URL not found"
                exit 1
            fi
        fi
    }
    
    echo "🔄 Regenerating Prisma client..."
    npx prisma generate || echo "⚠️ Prisma generate failed"
    
    echo "✅ Migration completed"
else
    echo "❌ Prisma schema not found"
    exit 1
fi

ENDSSH

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ RSS subscription migration applied successfully!"
else
    echo ""
    echo "❌ Migration failed"
    exit 1
fi

