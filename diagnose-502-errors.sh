#!/bin/bash
# Diagnostic script for 502 Bad Gateway errors on component loading
# This checks if build files exist and server is configured correctly

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "🔍 Diagnosing 502 Bad Gateway errors..."
echo ""

# Check if we can SSH to the server
echo "1️⃣ Checking server connectivity..."
if ssh -o ConnectTimeout=5 $SERVER "echo 'Connected'" 2>/dev/null; then
    echo "✅ Server is reachable"
else
    echo "❌ Cannot connect to server. Check SSH access."
    exit 1
fi

echo ""
echo "2️⃣ Checking if Node.js server is running..."
ssh $SERVER "pm2 list | grep abcotronics-erp || echo '❌ Server not running in PM2'"

echo ""
echo "3️⃣ Checking if dist/src directory exists..."
ssh $SERVER "if [ -d '$APP_DIR/dist/src' ]; then
    echo '✅ dist/src directory exists'
    echo '   Files count:'
    find $APP_DIR/dist/src -type f -name '*.js' | wc -l | xargs echo '   '
else
    echo '❌ dist/src directory does NOT exist'
    echo '   Run: npm run build on the server'
fi"

echo ""
echo "4️⃣ Checking if specific component files exist..."
COMPONENTS=(
    "dist/src/components/teams/ChecklistModal.js"
    "dist/src/components/teams/NoticeModal.js"
    "dist/src/components/manufacturing/Manufacturing.js"
    "dist/src/components/users/UserModal.js"
    "dist/src/components/invoicing/InvoiceModal.js"
)

for comp in "${COMPONENTS[@]}"; do
    ssh $SERVER "if [ -f '$APP_DIR/$comp' ]; then
        echo '✅ $comp exists'
    else
        echo '❌ $comp MISSING'
    fi"
done

echo ""
echo "5️⃣ Checking server.js static file configuration..."
ssh $SERVER "grep -A 5 'express.static' $APP_DIR/server.js | head -10 || echo 'Could not check server.js'"

echo ""
echo "6️⃣ Checking nginx configuration..."
ssh $SERVER "nginx -t 2>&1 | head -5 || echo 'Could not check nginx config'"

echo ""
echo "7️⃣ Testing a component file directly via HTTP..."
TEST_URL="https://abcoafrica.co.za/dist/src/components/teams/ChecklistModal.js"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$TEST_URL" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Component file is accessible (HTTP $HTTP_CODE)"
elif [ "$HTTP_CODE" = "502" ]; then
    echo "❌ Component file returns 502 Bad Gateway"
    echo "   This suggests the Node.js server is not responding or misconfigured"
elif [ "$HTTP_CODE" = "404" ]; then
    echo "❌ Component file returns 404 Not Found"
    echo "   The file does not exist at the expected path"
else
    echo "⚠️ Component file returned HTTP $HTTP_CODE"
fi

echo ""
echo "📋 Summary and Recommendations:"
echo ""
echo "If dist/src files are missing:"
echo "  1. SSH to server: ssh $SERVER"
echo "  2. Navigate to app: cd $APP_DIR"
echo "  3. Run build: npm run build"
echo "  4. Restart server: pm2 restart abcotronics-erp"
echo ""
echo "If files exist but return 502:"
echo "  1. Check if Node.js server is running: pm2 status"
echo "  2. Check server logs: pm2 logs abcotronics-erp --lines 50"
echo "  3. Check nginx logs: tail -50 /var/log/nginx/error.log"
echo "  4. Verify nginx proxy config points to correct port"
echo ""
echo "If files exist but return 404:"
echo "  1. Check server.js static file serving configuration"
echo "  2. Verify express.static is configured for /dist paths"
echo "  3. Check file permissions: ls -la $APP_DIR/dist/src/components/"
