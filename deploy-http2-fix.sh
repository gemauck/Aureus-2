#!/bin/bash
# Deploy HTTP/2 fix to production server
# Run this locally to deploy to abcoafrica.co.za

set -e

DOMAIN="abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"
APP_NAME="abcotronics-erp"

echo "🚀 Deploying HTTP/2 Fix to Production"
echo "======================================"
echo ""

echo "📋 Step 1: Uploading fix script to server..."
scp fix-http2-nginx.sh root@$DOMAIN:/root/

echo ""
echo "📋 Step 2: Connecting to server and deploying..."
ssh root@$DOMAIN << 'ENDSSH'
set -e

APP_DIR="/var/www/abcotronics-erp"
APP_NAME="abcotronics-erp"

echo "   ✅ Connected to server"
echo ""

echo "📥 Step 2a: Pulling latest code..."
cd $APP_DIR
git pull origin main
echo "   ✅ Code updated"

echo ""
echo "🔧 Step 2b: Applying nginx HTTP/2 fix..."
chmod +x /root/fix-http2-nginx.sh
/root/fix-http2-nginx.sh

echo ""
echo "🔄 Step 2c: Restarting application..."
pm2 restart $APP_NAME
echo "   ✅ Application restarted"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🧪 Next steps:"
echo "   1. Visit: https://abcoafrica.co.za"
echo "   2. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)"
echo "   3. Check browser console for errors"
ENDSSH

echo ""
echo "========================================="
echo "✅ Deployment Complete!"
echo "========================================="
echo ""
echo "🌐 Your site: https://abcoafrica.co.za"
echo ""
echo "🧪 Test steps:"
echo "   1. Hard refresh your browser (Cmd+Shift+R)"
echo "   2. Check console - should see no HTTP/2 errors"
echo "   3. Verify all JSX files load successfully"
echo ""

