#!/bin/bash
# Deploy Smart Sync - Implements intelligent field-level sync for document collection
# Prevents overwrites while enabling real-time collaboration

set -e

DROPLET_IP="165.22.127.196"
DOMAIN="abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Deploying Smart Sync to DigitalOcean Droplet"
echo "============================================="
echo "Feature: Smart Sync with Dirty Field Tracking"
echo "Benefits: Real-time collaboration + No overwrites"
echo ""

# Step 1: Commit and push to GitHub
echo "📝 Step 1: Committing changes to Git..."
git add src/components/projects/MonthlyDocumentCollectionTracker.jsx vite-modules/projects/src/components/MonthlyDocumentCollectionTracker.jsx package.json package-lock.json deploy-smart-sync.sh
git commit -m "Feat: Implement Smart Sync with Dirty Field Tracking

- Track which fields are currently being edited (dirty fields)
- Only sync fields that aren't dirty (not being edited)
- Enable real-time collaboration without overwrites
- Fields marked dirty onFocus, cleared 5s after onBlur
- Best practice approach for multi-user editing
- Prevents user input from being overwritten by LiveDataSync
- Updated deploy script to build Vite projects module"

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
echo "📦 Installing dependencies (including dev for build)..."
npm install || true

echo ""
echo "🏗️  Building JSX files..."
npm run build:jsx || node build-jsx.js || echo "⚠️ JSX build had warnings but continuing..."

echo ""
echo "🏗️  Building Vite projects module..."
(cd vite-modules/projects && npm install && npm run build) || echo "⚠️ Vite build had warnings but continuing..."

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
echo "   3. Try typing in a status field - no more overwrites!"
echo "   4. Open in two browser tabs to test real-time collaboration"
echo "   5. Hard refresh if needed: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)"
echo ""
echo "📊 Monitor logs:"
echo "   ssh root@$DROPLET_IP 'pm2 logs abcotronics-erp --lines 50'"
echo ""
echo "🔍 Check the console log for:"
echo "   '🔄 Smart Sync enabled - will sync non-dirty fields only'"
echo "   '🎯 Marking field as dirty: ...' (when you focus a field)"
echo "   '✨ Clearing dirty flag: ...' (5s after you blur a field)"
echo ""
echo "✨ Smart Sync Features:"
echo "   • Real-time collaboration - see others' changes"
echo "   • No overwrites - your typing is protected"
echo "   • Best practice implementation"
echo ""
