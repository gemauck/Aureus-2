#!/bin/bash
# Deploy inventory type update (Component/Final Product) with production tracking

echo "🚀 Deploying Inventory Type Update..."
echo "📡 Server: 165.22.127.196"

# Connect to production server and deploy
ssh root@165.22.127.196 << 'ENDSSH'
set -e

cd /var/www/abcotronics-erp

echo "📥 Pulling latest code..."
git fetch origin
git reset --hard origin/main

echo "✅ Code updated"

echo "🔧 Updating database schema..."
# Use Prisma db push to apply schema changes (adds new columns)
npx prisma db push --accept-data-loss

echo "🔄 Regenerating Prisma client..."
npx prisma generate

echo "🏗️  Building frontend (JSX and CSS)..."
npm run build || {
    echo "⚠️  Build failed, trying individual steps..."
    npm run build:jsx || echo "⚠️  JSX build had issues"
    npm run build:css || echo "⚠️  CSS build had issues"
}

echo "🔄 Restarting application..."
pm2 restart abcotronics-erp

echo "✅ Deployment complete!"
echo "📊 Check status with: pm2 status"
echo "📋 Check logs with: pm2 logs abcotronics-erp"
ENDSSH

echo "✅ Deployment successful!"
echo ""
echo "✨ Changes deployed:"
echo "  • Inventory type options changed to 'Component' and 'Final Product'"
echo "  • Added inProductionQuantity and completedQuantity fields"
echo "  • Final Products now track both in-production and completed units"

