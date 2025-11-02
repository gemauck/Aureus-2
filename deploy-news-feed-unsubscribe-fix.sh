#!/bin/bash
# Deploy news feed unsubscribe fix

set -e

echo "🚀 Deploying news feed unsubscribe fix..."
echo ""

# Server details
SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "📡 Connecting to server..."
ssh $SERVER << 'ENDSSH'
set -e

echo "✅ Connected to server"
echo ""

# Navigate to app directory
cd /var/www/abcotronics-erp
echo "📁 Current directory: $(pwd)"

# Pull latest changes
echo ""
echo "📥 Pulling latest changes from GitHub..."
git fetch origin
git reset --hard origin/main || {
    echo "⚠️  Git reset failed, trying to stash changes..."
    git stash
    git reset --hard origin/main
}

# Clean untracked files
git clean -fd

echo ""
echo "✅ Code updated"

# Build frontend if needed
echo ""
echo "🔨 Building frontend (if needed)..."
if [ -f "build-jsx.js" ]; then
    node build-jsx.js || echo "⚠️  Build script not found or failed"
fi

# Restart the application
echo ""
echo "🔄 Restarting application..."
if command -v pm2 &> /dev/null; then
    pm2 restart abcotronics-erp || pm2 restart all
    echo "✅ Application restarted with PM2"
    echo ""
    echo "📊 PM2 status:"
    pm2 status
elif command -v systemctl &> /dev/null; then
    systemctl restart abcotronics-erp || echo "⚠️  Systemd service not found"
else
    echo "⚠️  Neither PM2 nor systemctl found. Please restart the app manually."
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🧪 Testing:"
echo "   1. Go to Client News Feed"
echo "   2. Unsubscribe from a client's news"
echo "   3. Refresh the page"
echo "   4. Articles for that client should NOT appear"

ENDSSH

echo ""
echo "========================================="
echo "✅ News feed unsubscribe fix deployed!"
echo "========================================="

