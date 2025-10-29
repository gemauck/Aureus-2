#!/bin/bash
# Deploy performance optimization fix

set -e

echo "🚀 Deploying Performance Optimization Fix..."
echo ""

# Check if changes are committed
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  You have uncommitted changes. Committing them now..."
    git add -A
    git commit -m "Performance optimization deployment" || true
fi

# Step 1: Push to git
echo "📤 Pushing to git..."
git push origin main
echo "✅ Code pushed"
echo ""

# Step 2: Deploy on server
echo "🔧 Deploying on server..."
ssh root@abcoafrica.co.za << 'DEPLOY'
set -e

echo "📥 Pulling latest code..."
cd /var/www/abcotronics-erp
git pull origin main

echo "🔨 Building project..."
npm run build

echo "🔄 Restarting app..."
pm2 restart abcotronics-erp || pm2 start server.js --name abcotronics-erp

echo "✅ Server updated!"
DEPLOY

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Clear browser cache (Ctrl+Shift+R or Cmd+Shift+R)"
echo "   2. Test the site - it should load much faster now!"
echo "   3. Monitor server logs: ssh root@abcoafrica.co.za 'pm2 logs abcotronics-erp'"
echo ""

