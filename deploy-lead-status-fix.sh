#!/bin/bash
# Deploy Lead Status Fix to Droplet

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
npm install --production

# Generate Prisma client
echo "🏗️  Generating Prisma client..."
npx prisma generate

# Apply migration
echo "🗄️  Applying database migration..."
npx prisma migrate deploy

# Restart the application
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp

echo "✅ Deployment complete!"
echo "🧪 Test by changing a lead status and refreshing the page"
ENDSSH

echo "✅ Deployment successful!"

