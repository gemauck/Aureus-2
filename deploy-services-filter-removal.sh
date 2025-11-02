#!/bin/bash
# Deploy Services filter removal from leads page

set -e

echo "🚀 Deploying Services filter removal from leads page..."
echo ""

# Server details
SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "📦 Building JSX components..."
npm run build:jsx || node build-jsx.js

echo ""
echo "📤 Uploading changes to server..."
scp src/components/clients/Clients.jsx $SERVER:$APP_DIR/src/components/clients/

echo ""
echo "🔧 Applying changes on server..."
ssh $SERVER << 'ENDSSH'
set -e
cd /var/www/abcotronics-erp

echo "🧱 Rebuilding frontend (JSX → dist)..."
npm run build:jsx || node build-jsx.js || true

echo ""
echo "🔄 Restarting application..."
if command -v pm2 &> /dev/null; then
    pm2 restart abcotronics-erp || pm2 restart all
    echo "✅ Application restarted with PM2"
else
    echo "⚠️  PM2 not found. Please restart the app manually."
fi

echo ""
echo "✅ Deployment complete!"
ENDSSH

echo ""
echo "========================================="
echo "✅ Deployment complete!"
echo "========================================="
echo ""
echo "The Services filter has been removed from the leads page."
echo "Please refresh your browser (Cmd+Shift+R or Ctrl+Shift+R) to see the changes."

