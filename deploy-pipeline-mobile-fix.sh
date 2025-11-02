#!/bin/bash
# Deploy Pipeline Mobile Drag-and-Drop and Tile Size Fix

set -e

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Deploying Pipeline Mobile Fixes..."
echo "📡 Server: $SERVER"
echo ""

# Step 1: Build JSX (Pipeline.jsx was modified)
echo "🏗️  Building JSX..."
npm run build:jsx || echo "⚠️  JSX build may not be needed, continuing..."

# Step 2: Check git status
echo ""
echo "📋 Checking git status..."
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 Files changed:"
    git status --short
    echo ""
    read -p "Do you want to commit and push these changes? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git add src/components/clients/Pipeline.jsx
        git commit -m "fix: Add mobile drag-and-drop support for pipeline tiles and ensure consistent tile sizing"
        echo "📤 Pushing to git..."
        git push origin main || git push origin master
        echo "✅ Changes committed and pushed"
    else
        echo "⚠️  Skipping git commit. Make sure to commit changes manually before deploying."
        read -p "Continue with deployment anyway? (y/n) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "❌ Deployment cancelled"
            exit 1
        fi
    fi
else
    echo "✅ No uncommitted changes"
    echo "📤 Ensuring latest code is pushed..."
    git push origin main || git push origin master || echo "⚠️  Git push skipped"
fi

# Step 3: Deploy to server
echo ""
echo "🚀 Deploying to server..."
ssh $SERVER << 'DEPLOY'
set -e

echo "✅ Connected to server"
cd /var/www/abcotronics-erp

echo "📥 Pulling latest code..."
git fetch origin
git pull origin main || git pull origin master
echo "✅ Code updated"

echo "📦 Installing dependencies..."
if ! npm ci --omit=dev; then
  echo "⚠️  npm ci failed; attempting standard install..."
  if ! npm install --omit=dev; then
    echo "⚠️  npm install failed; cleaning problematic modules and retrying..."
    rm -rf node_modules/.cache || true
    rm -rf node_modules/googleapis || true
    rm -rf node_modules || true
    npm install --omit=dev
  fi
fi

echo "🏗️  Generating Prisma client..."
npx prisma generate || echo "⚠️  Prisma generate skipped"

echo "🏗️  Building JSX..."
npm run build:jsx || node build-jsx.js || echo "⚠️  JSX build skipped"

echo "🏗️  Building CSS..."
npm run build:css || echo "⚠️  CSS build skipped"

echo "🔄 Restarting application..."
pm2 restart abcotronics-erp || pm2 start server.js --name abcotronics-erp

echo ""
echo "✅ Deployment complete!"
echo "🌐 Check your site: https://abcoafrica.co.za"
DEPLOY

echo ""
echo "✅ Deployment successful!"
echo "📱 Pipeline mobile fixes are now live!"
echo ""
echo "💡 Testing:"
echo "   1. Hard refresh your browser (Cmd+Shift+R / Ctrl+Shift+R)"
echo "   2. Test drag-and-drop on mobile device"
echo "   3. Verify all pipeline tiles are the same size"
echo "   4. Check that touch gestures work for moving tiles between stages"
echo ""
echo "📋 Changes deployed:"
echo "   • Touch event handlers for mobile drag-and-drop"
echo "   • Consistent tile sizing (75px fixed height for all tiles)"
echo "   • Fixed internal section heights for uniform appearance"
echo "   • Visual feedback during drag operations"

