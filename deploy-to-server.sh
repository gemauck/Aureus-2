#!/bin/bash
# Deploy code changes to server

set -e

echo "🚀 Deploying code changes to server..."
echo ""

# Server details
SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"
APP_PORT="3000"

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
git reset --hard origin/main || {
    echo "⚠️  Git reset failed, trying to stash changes..."
    git stash
    git reset --hard origin/main
}

# Clean untracked files that would conflict
git clean -fd

echo ""
echo "✅ Code updated"

# Restart the application
echo ""
echo "🔄 Restarting application..."
if command -v pm2 &> /dev/null; then
    pm2 restart abcotronics-erp || pm2 restart all
    echo "✅ Application restarted with PM2"
elif command -v systemctl &> /dev/null; then
    systemctl restart abcotronics-erp || echo "⚠️  Systemd service not found, app may be running differently"
else
    echo "⚠️  Neither PM2 nor systemctl found. Please restart the app manually."
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Update nginx configuration: /root/deploy-http2-jsx-fix.sh"
echo "   2. Test the application at https://abcoafrica.co.za"

ENDSSH

echo ""
echo "========================================="
echo "✅ Code deployment complete!"
echo "========================================="
echo ""
echo "📋 Next: Update nginx configuration"
echo ""
echo "Run this to update nginx:"
echo "  scp deploy-http2-jsx-fix.sh $SERVER:/root/"
echo "  ssh $SERVER"
echo "  chmod +x /root/deploy-http2-jsx-fix.sh"
echo "  /root/deploy-http2-jsx-fix.sh"
echo ""

