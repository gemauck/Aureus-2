#!/bin/bash
# Fix script for 502 Bad Gateway errors on component loading
# This rebuilds the dist/src files on the production server

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "🔧 Fixing 502 Bad Gateway errors by rebuilding component files..."
echo ""

# Check if we can SSH to the server
if ! ssh -o ConnectTimeout=5 $SERVER "echo 'Connected'" 2>/dev/null; then
    echo "❌ Cannot connect to server. Check SSH access."
    exit 1
fi

echo "1️⃣ Checking current server status..."
ssh $SERVER "cd $APP_DIR && pm2 status | grep abcotronics-erp || echo 'Server not running'"

echo ""
echo "2️⃣ Checking if dist/src exists..."
ssh $SERVER "if [ -d '$APP_DIR/dist/src' ]; then
    echo '✅ dist/src exists'
    echo '   Backing up current dist/src...'
    mv $APP_DIR/dist/src $APP_DIR/dist/src.backup.\$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
else
    echo '⚠️ dist/src does not exist (will be created)'
fi"

echo ""
echo "3️⃣ Running build on production server..."
ssh $SERVER << 'ENDSSH'
cd /var/www/abcotronics-erp

echo "   Installing dependencies if needed..."
npm install --production=false 2>&1 | tail -5

echo "   Running build script..."
if npm run build 2>&1 | tee /tmp/build-output.log; then
    echo "✅ Build completed successfully"
else
    echo "❌ Build failed. Check /tmp/build-output.log on server"
    exit 1
fi

# Verify some key files were created
if [ -f "dist/src/components/teams/ChecklistModal.js" ] && \
   [ -f "dist/src/components/manufacturing/Manufacturing.js" ]; then
    echo "✅ Key component files verified"
else
    echo "⚠️ Some component files may be missing"
fi
ENDSSH

if [ $? -eq 0 ]; then
    echo ""
    echo "4️⃣ Restarting server..."
    ssh $SERVER "cd $APP_DIR && pm2 restart abcotronics-erp"
    
    echo ""
    echo "5️⃣ Waiting for server to start..."
    sleep 3
    
    echo ""
    echo "6️⃣ Testing component file access..."
    TEST_URL="https://abcoafrica.co.za/dist/src/components/teams/ChecklistModal.js"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$TEST_URL" 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo "✅ Component files are now accessible (HTTP $HTTP_CODE)"
        echo ""
        echo "🎉 Fix complete! The 502 errors should be resolved."
    elif [ "$HTTP_CODE" = "502" ]; then
        echo "⚠️ Still getting 502 errors. Check:"
        echo "   - Server logs: ssh $SERVER 'pm2 logs abcotronics-erp --lines 50'"
        echo "   - Nginx logs: ssh $SERVER 'tail -50 /var/log/nginx/error.log'"
        echo "   - Server status: ssh $SERVER 'pm2 status'"
    else
        echo "⚠️ Component file returned HTTP $HTTP_CODE"
        echo "   Check server configuration and logs"
    fi
else
    echo ""
    echo "❌ Build failed. Please check the error messages above."
    echo "   You may need to:"
    echo "   1. Check Node.js version: ssh $SERVER 'node --version'"
    echo "   2. Check npm version: ssh $SERVER 'npm --version'"
    echo "   3. Check build script: ssh $SERVER 'cat $APP_DIR/package.json | grep build'"
    exit 1
fi

echo ""
echo "📋 Next steps:"
echo "   1. Clear browser cache and reload the application"
echo "   2. Check browser console for any remaining errors"
echo "   3. If issues persist, run: ./diagnose-502-errors.sh"



