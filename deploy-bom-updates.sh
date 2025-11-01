#!/bin/bash
# Quick deploy script for BOM form updates

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Deploying BOM form updates to server..."

ssh root@$DROPLET_IP << 'ENDSSH'
set -e

cd /var/www/abcotronics-erp

echo "📥 Pulling latest changes..."
git fetch origin
git reset --hard origin/main

echo "🔄 Restarting application..."
pm2 restart abcotronics-erp || pm2 restart all

echo "✅ Deployment complete!"
ENDSSH

echo "✅ Changes deployed to server!"

