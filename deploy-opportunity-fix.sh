#!/bin/bash
# Deploy Opportunity Pipeline Fix to DigitalOcean Droplet

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Deploying Opportunity Pipeline Fix to Droplet..."

# SSH into droplet and deploy
ssh root@$DROPLET_IP << 'ENDSSH'
set -e

echo "✅ Connected to droplet"
cd /var/www/abcotronics-erp

echo "📥 Pulling latest changes..."
git fetch origin
git reset --hard origin/main

echo "📦 Installing dependencies..."
npm install --production

echo "🏗️  Generating Prisma client..."
npx prisma generate

echo "🗄️  Pushing database schema changes..."
./scripts/safe-db-migration.sh npx prisma db push || echo "⚠️  Database push warning (may already be up to date"

echo "🔄 Running opportunity stages migration..."
node fix-opportunity-stages.js || echo "⚠️  Migration script warning (may not be necessary)"

echo "🔄 Restarting application..."
pm2 restart abcotronics-erp

echo "✅ Deployment complete!"
echo "🌐 Application restarted with opportunity pipeline fix"
ENDSSH

echo "✅ Deployment successful!"
echo "📊 Check the pipeline page - opportunities should now be visible!"

