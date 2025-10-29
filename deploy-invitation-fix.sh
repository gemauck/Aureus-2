#!/bin/bash
# Deploy invitation fix to production server

set -e

echo "🚀 Deploying invitation fix to server..."
echo ""

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "📡 Connecting to server and deploying..."
ssh $SERVER << 'ENDSSH'
set -e

cd /var/www/abcotronics-erp
echo "📁 Current directory: $(pwd)"

echo ""
echo "📥 Pulling latest changes from GitHub..."
git pull origin main

echo ""
echo "✅ Code updated"

echo ""
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Check application status:"
pm2 status
pm2 logs abcotronics-erp --lines 20

ENDSSH

echo ""
echo "========================================="
echo "✅ Invitation fix deployed successfully!"
echo "========================================="
echo ""
echo "🌐 Test the invitation feature at: https://abcoafrica.co.za"
echo ""

