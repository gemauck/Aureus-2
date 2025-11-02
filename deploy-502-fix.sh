#!/bin/bash
# Deploy 502 Bad Gateway Fix
# This fixes error handling for manufacturing API and improves logging

set -e

echo "🚀 Deploying 502 Bad Gateway Fix..."
echo ""

cd "$(dirname "$0")"

# Commit changes
echo "📝 Committing changes..."
git add server.js 502-BAD-GATEWAY-FIX.md diagnose-502-errors.sh
git commit -m "Fix: Enhanced error handling for manufacturing API endpoints

- Added comprehensive logging for manufacturing API requests
- Improved error catching and reporting with better messages
- Created diagnostic tools for troubleshooting 502 errors
- Enhanced error responses for better debugging

This should help identify and fix 502 Bad Gateway errors
occurring with manufacturing endpoints and static file serving."

echo "✅ Changes committed"
echo ""

# Check if deploying to Railway or direct server
if [ -n "$RAILWAY" ] || grep -q "railway" package.json 2>/dev/null; then
    echo "⬆️  Pushing to GitHub (Railway auto-deploy)..."
    git push origin main
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully pushed to GitHub"
        echo ""
        echo "🔄 Railway will auto-deploy (~2 minutes)"
        echo ""
        echo "📋 After deployment:"
        echo "  1. Check logs for manufacturing API requests"
        echo "  2. Test: https://abcoafrica.co.za/manufacturing"
        echo "  3. Run diagnose-502-errors.sh if issues persist"
    else
        echo "❌ Failed to push to GitHub"
        exit 1
    fi
else
    # Direct server deployment
    SERVER="root@abcoafrica.co.za"
    APP_DIR="/var/www/abcotronics-erp"
    
    echo "📤 Pushing to GitHub first..."
    git push origin main
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to push to GitHub"
        exit 1
    fi
    
    echo ""
    echo "📡 Deploying to server..."
    ssh $SERVER << ENDSSH
set -e

echo "✅ Connected to server"
cd $APP_DIR

echo "📥 Pulling latest changes..."
git fetch origin
git reset --hard origin/main || {
    echo "⚠️  Git reset failed, trying to stash changes..."
    git stash
    git reset --hard origin/main
}
git clean -fd

echo "✅ Code updated"
echo ""

echo "🔄 Restarting application..."
if command -v pm2 &> /dev/null; then
    pm2 restart abcotronics-erp || pm2 restart all
    pm2 logs --lines 20 abcotronics-erp
    echo "✅ Application restarted with PM2"
elif command -v systemctl &> /dev/null; then
    systemctl restart abcotronics-erp
    systemctl status abcotronics-erp --no-pager -l
    echo "✅ Application restarted with systemctl"
else
    echo "⚠️  Neither PM2 nor systemctl found. Please restart the app manually."
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Run: ./diagnose-502-errors.sh to check server status"
echo "  2. Test: https://abcoafrica.co.za/api/manufacturing/inventory"
echo "  3. Check logs for manufacturing API requests"

ENDSSH

    echo ""
    echo "========================================="
    echo "✅ Deployment complete!"
    echo "========================================="
fi

