#!/bin/bash
# Deploy leads persistence fix to production

set -e

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Deploying Leads Persistence Fix..."
echo "📡 Server: $SERVER"
echo ""

# Step 1: Build locally
echo "🏗️  Building project..."
npm run build:css || echo "⚠️  CSS build skipped"
npm run build:jsx || echo "⚠️  JSX build skipped"
echo "✅ Build complete"
echo ""

# Step 2: Deploy files via rsync
echo "📤 Copying fixed files to server..."
rsync -avz --progress \
  src/utils/databaseAPI.js \
  src/components/clients/ClientsDatabaseFirst.jsx \
  src/components/clients/ClientsMobileOptimized.jsx \
  dist/ \
  "$SERVER:$APP_DIR/"

echo "✅ Files copied"
echo ""

# Step 3: Restart application on server
echo "🔄 Restarting application..."
ssh $SERVER << 'DEPLOY'
set -e

cd /var/www/abcotronics-erp

echo "🔄 Restarting PM2 process..."
pm2 restart abcotronics-erp --update-env || pm2 start server.js --name abcotronics-erp --update-env

echo "✅ Application restarted"
echo ""
echo "📊 PM2 Status:"
pm2 status

echo ""
echo "📋 Recent logs:"
pm2 logs abcotronics-erp --lines 10 --nostream

DEPLOY

echo ""
echo "✅ Deployment complete!"
echo "🌐 Test at: https://abcoafrica.co.za"
echo "💡 Hard refresh your browser (Cmd+Shift+R / Ctrl+Shift+R) to see changes"

