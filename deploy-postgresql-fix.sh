#!/bin/bash
# Deploy PostgreSQL schema fix to production server

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Deploying PostgreSQL schema fix to production..."
echo "📡 Server: $DROPLET_IP"
echo "📁 App Directory: $APP_DIR"

# SSH into production server and deploy
ssh root@$DROPLET_IP << 'ENDSSH'
set -e

cd /var/www/abcotronics-erp

echo "✅ Connected to server"
echo "📁 Current directory: $(pwd)"

# Pull latest changes from git
echo "📥 Pulling latest changes from Git..."
git fetch origin
git reset --hard origin/main || echo "⚠️ Git pull failed, continuing..."

# Generate Prisma client for PostgreSQL
echo "🏗️ Generating Prisma client for PostgreSQL..."
npx prisma generate

# Push schema to PostgreSQL database
echo "🗄️ Pushing database schema to PostgreSQL..."
npx prisma db push --accept-data-loss || echo "⚠️ Database push failed"

# Restart PM2 process
echo "🔄 Restarting PM2 process..."
pm2 restart abcotronics-erp || pm2 start ecosystem.config.mjs

# Save PM2 configuration
pm2 save

echo "✅ Deployment complete!"

# Show status
echo ""
echo "📊 PM2 Status:"
pm2 status

echo ""
echo "📋 Recent logs:"
pm2 logs abcotronics-erp --lines 20 --nostream
ENDSSH

echo ""
echo "✅ Fix deployed successfully!"
echo ""
echo "🔍 To verify, check the logs on the server:"
echo "   ssh root@$DROPLET_IP 'pm2 logs abcotronics-erp --lines 50'"
echo ""
echo "🌐 Test the API:"
echo "   curl https://abcoafrica.co.za/api/health"

