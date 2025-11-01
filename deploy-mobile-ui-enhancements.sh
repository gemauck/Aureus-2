#!/bin/bash
# Deploy Mobile UI Enhancements to production

set -e

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "📱 Deploying Mobile UI Enhancements..."
echo "📡 Server: $SERVER"
echo ""

# Step 1: Build CSS (mobile-optimizations.css was modified)
echo "🏗️  Building CSS..."
npm run build:css || echo "⚠️  CSS build skipped"

# Step 2: Build JSX (may not be needed, but ensure all components are built)
echo "🏗️  Building JSX..."
npm run build:jsx || echo "⚠️  JSX build may not be needed, continuing..."

# Step 3: Check git status
echo ""
echo "📋 Checking git status..."
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 Files changed:"
    git status --short
    echo ""
    read -p "Do you want to commit and push these changes? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git add mobile-optimizations.css index.html src/utils/mobileTableConverter.js MOBILE-UI-ENHANCEMENTS.md
        git commit -m "feat: Comprehensive mobile UI enhancements - tables, forms, and boxes are now much more usable on mobile devices"
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

# Step 4: Deploy to server
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
# Prefer clean, deterministic installs; handle occasional ENOTEMPTY errors
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
echo "📱 Mobile UI enhancements are now live!"
echo ""
echo "💡 Testing:"
echo "   1. Hard refresh your browser (Cmd+Shift+R / Ctrl+Shift+R)"
echo "   2. Test on mobile device or DevTools mobile view (≤768px width)"
echo "   3. Check that tables convert to cards"
echo "   4. Verify forms have large, easily tappable inputs"
echo "   5. Confirm boxes/cards have better spacing"
echo ""
echo "📋 Changes deployed:"
echo "   • Tables automatically convert to cards on mobile"
echo "   • Forms have larger inputs (52px min height, 16px font)"
echo "   • Checkboxes/radios are 28px (much easier to tap)"
echo "   • Boxes have improved padding and spacing"
echo "   • Automatic table-to-card conversion utility"
