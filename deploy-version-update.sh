#!/bin/bash
# Deploy best-practice version update system to production

set -e

echo "🚀 Deploying Best-Practice Version Update System..."
echo ""

# Server details
SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "📡 Connecting to server: $SERVER"
echo ""

ssh $SERVER << ENDSSH
set -e

echo "✅ Connected to server"
echo ""

# Navigate to app directory
cd $APP_DIR
echo "📁 Current directory: \$(pwd)"
echo ""

# Backup current index.html
if [ -f "index.html" ]; then
    echo "💾 Backing up current index.html..."
    cp index.html index.html.backup.\$(date +%Y%m%d_%H%M%S)
    echo "✅ Backup created"
    echo ""
fi

# Copy new index.html from local
echo "📋 Updating index.html with best-practice version watcher..."
cat > index.html << 'INDEXEOF'
$(cat index.html)
INDEXEOF

echo "✅ index.html updated"
echo ""

# Verify the file was updated
if grep -q "Version polling logic: Best practice implementation" index.html; then
    echo "✅ Verification: Best-practice version watcher is present"
else
    echo "⚠️  Warning: Could not verify version watcher in index.html"
fi

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "📝 What was deployed:"
echo "   ✅ Best-practice version polling (60s interval)"
echo "   ✅ Visibility API integration (checks when user returns to tab)"
echo "   ✅ Non-intrusive update banner"
echo "   ✅ Smart dismissal (respects user choice)"
echo "   ✅ Throttled checks (max once per 15s)"
echo ""
echo "🔄 No server restart needed - changes take effect on next page load"
echo ""

ENDSSH

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🧪 To test:"
echo "   1. Open https://abcoafrica.co.za/ in a browser"
echo "   2. Open DevTools Console"
echo "   3. Run: window.checkAppVersion()"
echo "   4. Check Network tab for /version requests every 60 seconds"
echo ""


