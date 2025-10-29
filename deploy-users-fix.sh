#!/bin/bash
# Deploy Users menu fix to droplet

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Deploying Users menu fix to droplet..."
echo "📡 Droplet IP: $DROPLET_IP"
echo ""

# SSH into droplet and deploy
ssh root@$DROPLET_IP << 'ENDSSH'
set -e

cd /var/www/abcotronics-erp

echo "📥 Pulling latest code..."
git pull origin main

echo "🔨 Building JSX files..."
npm run build:jsx

echo "🔄 Restarting application..."
pm2 restart abcotronics-erp

echo "✅ Deployment complete!"
echo "Check logs: pm2 logs abcotronics-erp"
ENDSSH

echo ""
echo "✅ Users menu fix deployed!"

