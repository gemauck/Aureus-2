#!/bin/bash
# Quick deployment script for email and user deletion fixes

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Deploying email and user deletion fixes to production..."
echo "📡 Droplet IP: $DROPLET_IP"

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

echo "🔄 Restarting application..."
pm2 restart abcotronics-erp

echo "📊 Checking PM2 status..."
pm2 status

echo "📋 Recent logs:"
pm2 logs abcotronics-erp --lines 10 --nostream

echo "✅ Deployment complete!"
ENDSSH

echo "✅ Deployment successful!"
echo "🌐 Application should be live at: https://abcoafrica.co.za"

