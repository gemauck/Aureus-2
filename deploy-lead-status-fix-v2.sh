#!/bin/bash
# Deploy Lead Status Fix to Droplet (version 2 - handles migration provider switch)

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Deploying Lead Status Fix to Droplet..."
echo "📡 Droplet IP: $DROPLET_IP"

# SSH into droplet and deploy
ssh root@$DROPLET_IP << 'ENDSSH'
set -e

echo "✅ Connected to droplet"

cd /var/www/abcotronics-erp

# Pull latest changes
echo "📥 Pulling latest changes from git..."
git fetch origin
git reset --hard origin/main

# Install dependencies if needed
echo "📦 Checking dependencies..."
npm install --production --omit=dev

# Generate Prisma client
echo "🏗️  Generating Prisma client..."
npx prisma generate

# Apply migration using db push (handles provider switch)
echo "🗄️  Applying database schema changes..."
npx prisma db push --accept-data-loss

# Apply the migration SQL manually to fix existing data
echo "🔧 Applying migration SQL to fix existing lead statuses..."
npx prisma db execute --stdin << 'SQL'
-- Change the default value for the status column
ALTER TABLE "Client" ALTER COLUMN "status" SET DEFAULT 'Potential';

-- Update existing leads with "active" status to "Potential" 
-- (only for leads, not clients)
UPDATE "Client" 
SET "status" = 'Potential' 
WHERE "type" = 'lead' 
  AND ("status" = 'active' OR "status" IS NULL OR "status" = '');
SQL

# Restart the application
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp

echo "✅ Deployment complete!"
echo "🧪 Test by changing a lead status and refreshing the page"
ENDSSH

echo "✅ Deployment successful!"

