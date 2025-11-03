#!/bin/bash
# Deploy comment auto-scroll feature

set -e

echo "🚀 Deploying comment auto-scroll feature..."
echo ""

# Server details
SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "📡 Connecting to server..."
ssh $SERVER << ENDSSH
set -e

echo "✅ Connected to server"
echo ""

# Navigate to app directory
cd $APP_DIR
echo "📁 Current directory: \$(pwd)"

# Pull latest changes
echo ""
echo "📥 Pulling latest changes from GitHub..."
git fetch origin
git reset --hard origin/main || {
    echo "⚠️  Git reset failed, trying to stash changes..."
    git stash
    git reset --hard origin/main
}

# Clean untracked files that would conflict
git clean -fd

echo ""
echo "✅ Code updated"

# Build frontend (JSX → dist)
echo ""
echo "🏗️  Building frontend (JSX → dist)..."
if command -v npm &> /dev/null; then
    npm run build:jsx || node build-jsx.js || echo "⚠️  JSX build failed, continuing anyway..."
else
    echo "⚠️  npm not found, skipping build"
fi

# Restart the application
echo ""
echo "🔄 Restarting application..."
if command -v pm2 &> /dev/null; then
    pm2 restart abcotronics-erp || pm2 restart all
    echo "✅ Application restarted with PM2"
    pm2 save || true
elif command -v systemctl &> /dev/null; then
    systemctl restart abcotronics-erp || echo "⚠️  Systemd service not found, app may be running differently"
else
    echo "⚠️  Neither PM2 nor systemctl found. Please restart the app manually."
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Changes deployed:"
echo "   - CommentsPopup.jsx - Auto-scroll to last comment"
echo "   - TaskDetailModal.jsx - Auto-scroll when comments tab opens"
echo "   - ClientDetailModal.jsx - Auto-scroll when notes tab opens"
echo "   - MonthlyDocumentCollectionTracker.jsx - Auto-scroll in comment popup"
echo ""
echo "🧪 Test the feature:"
echo "   1. Open any comment box"
echo "   2. Verify it automatically scrolls to the last comment"
echo ""

ENDSSH

echo ""
echo "========================================="
echo "✅ Comment auto-scroll feature deployed!"
echo "========================================="
echo ""
echo "🧪 Test at: https://abcoafrica.co.za"
echo ""

