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

# Step 2: Verify build output
if [ ! -f "dist/src/components/clients/Clients.js" ]; then
    echo "❌ ERROR: dist/src/components/clients/Clients.js not found after build!"
    echo "   Make sure build:jsx completed successfully"
    exit 1
fi

if [ ! -f "dist/build-version.json" ]; then
    echo "❌ ERROR: dist/build-version.json not found after build!"
    echo "   Make sure build:jsx completed successfully"
    exit 1
fi

BUILD_VERSION=$(cat dist/build-version.json | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
echo "📦 Build version: $BUILD_VERSION"
echo ""

# Step 3: Deploy files via rsync
echo "📤 Copying built files to server..."
rsync -avz --progress \
  dist/ \
  index.html \
  "$SERVER:$APP_DIR/"

echo "✅ Files copied"
echo ""

# Step 4: Restart application on server
echo "🔄 Restarting application..."
ssh $SERVER << DEPLOY
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

echo ""
echo "🧹 Clearing server-side cache..."
# Clear any server-side caches
if [ -d "/var/www/abcotronics-erp/.cache" ]; then
    rm -rf /var/www/abcotronics-erp/.cache/*
    echo "   Cleared .cache directory"
fi

DEPLOY

echo ""
echo "✅ Deployment complete!"
echo "🌐 Test at: https://abcoafrica.co.za"
echo "📦 Build version: $BUILD_VERSION"
echo ""
echo "💡 IMPORTANT: Clear your browser cache:"
echo "   - Chrome/Edge: Cmd+Shift+Delete (Mac) or Ctrl+Shift+Delete (Windows)"
echo "   - Or hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)"
echo "   - Or add ?forceRefresh=1 to the URL"

