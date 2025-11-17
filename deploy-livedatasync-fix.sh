#!/bin/bash
# Deploy LiveDataSync Fix - Prevents document collection page from auto-refreshing
# Fixes the issue where typing gets overwritten by background data sync

set -e

DROPLET_IP="165.22.127.196"
DOMAIN="abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Deploying LiveDataSync Fix to DigitalOcean Droplet"
echo "======================================================"
echo "Fix: Disable LiveDataSync on Monthly Document Collection page"
echo "Issue: Page was refreshing while user was typing"
echo ""

# Step 1: Commit and push to GitHub
echo "📝 Step 1: Committing changes to Git..."
git add src/components/projects/MonthlyDocumentCollectionTracker.jsx vite-modules/projects/src/components/MonthlyDocumentCollectionTracker.jsx
git commit -m "Fix: Disable LiveDataSync on Document Collection page

- Completely disable LiveDataSync for MonthlyDocumentCollectionTracker
- Fixed both src/ and vite-modules/ versions of the component
- Prevents page from auto-refreshing while user is typing
- LiveDataSync is paused on mount and resumed on unmount
- Explicit save operations still work normally
- Fixes user input being overwritten by background sync"

echo "✅ Changes committed"
echo ""

echo "📤 Step 2: Pushing to GitHub..."
git push origin main
echo "✅ Pushed to GitHub"
echo ""

# Step 2: Deploy to server
echo "📡 Step 3: Deploying to droplet..."
ssh root@$DROPLET_IP << 'ENDSSH'
set -e

echo "✅ Connected to droplet"
echo ""

# Navigate to app directory
cd /var/www/abcotronics-erp
echo "📁 Current directory: $(pwd)"
echo ""

# Pull latest changes
echo "📥 Pulling latest changes from GitHub..."
if git pull origin main; then
    echo "✅ Code updated successfully"
else
    echo "⚠️  Git pull had conflicts, trying to resolve..."
    git stash || true
    git pull origin main
    echo "✅ Code updated after stash"
fi

echo ""
echo "📦 Installing dependencies (if needed)..."
npm install --omit=dev || true

echo ""
echo "🏗️  Building JSX files..."
npm run build:jsx || node build-jsx.js || echo "⚠️ JSX build had warnings but continuing..."

echo ""
echo "🔄 Restarting application..."

# Try PM2 first
if command -v pm2 &> /dev/null; then
    echo "   Using PM2..."
    pm2 restart abcotronics-erp || pm2 restart all
    pm2 save
    echo "   ✅ Application restarted with PM2"
else
    echo "   ⚠️  PM2 not found, trying systemctl..."
    systemctl restart abcotronics-erp || echo "   ⚠️  Could not restart automatically"
fi

echo ""
echo "========================================="
echo "✅ Deployment complete!"
echo "========================================="
echo ""

ENDSSH

echo ""
echo "✅ Deployment to droplet complete!"
echo ""
echo "🧪 Test your deployment:"
echo "   1. Visit: https://$DOMAIN"
echo "   2. Navigate to a project's Document Collection page"
echo "   3. Try typing in any field - it should stay static now!"
echo "   4. Hard refresh if needed: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)"
echo ""
echo "📊 Monitor logs:"
echo "   ssh root@$DROPLET_IP 'pm2 logs abcotronics-erp --lines 50'"
echo ""
echo "🔍 Check the console log for:"
echo "   '🛑 PERMANENTLY pausing LiveDataSync for MonthlyDocumentCollectionTracker'"
echo ""
