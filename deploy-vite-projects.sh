#!/bin/bash
# Quick deployment script for Vite Projects module
# Deploys only the dist/vite-projects directory to production

set -e

DROPLET_IP="165.22.127.196"
DOMAIN="abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Deploying Vite Projects Module to Production"
echo "================================================"
echo "IP: $DROPLET_IP"
echo "Domain: $DOMAIN"
echo ""

# Step 1: Build locally first
echo "🏗️  Step 1: Building Vite Projects module locally..."
npm run build:vite-projects
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi
echo "✅ Build complete"
echo ""

# Step 2: Verify files exist
echo "🔍 Step 2: Verifying build files..."
if [ ! -f "dist/vite-projects/projects-module.js" ]; then
    echo "❌ Error: dist/vite-projects/projects-module.js not found"
    exit 1
fi
if [ ! -f "dist/vite-projects/projects-index.css" ]; then
    echo "❌ Error: dist/vite-projects/projects-index.css not found"
    exit 1
fi
echo "✅ Files verified"
echo ""

# Step 3: Deploy to server
echo "📤 Step 3: Deploying files to server..."
scp -r dist/vite-projects root@$DROPLET_IP:$APP_DIR/dist/
if [ $? -ne 0 ]; then
    echo "❌ Deployment failed"
    exit 1
fi
echo "✅ Files deployed"
echo ""

# Step 4: Verify on server
echo "🔍 Step 4: Verifying files on server..."
ssh root@$DROPLET_IP << ENDSSH
cd $APP_DIR
if [ -f "dist/vite-projects/projects-module.js" ]; then
    echo "✅ projects-module.js exists"
    ls -lh dist/vite-projects/projects-module.js
else
    echo "❌ projects-module.js missing on server"
    exit 1
fi
if [ -f "dist/vite-projects/projects-index.css" ]; then
    echo "✅ projects-index.css exists"
    ls -lh dist/vite-projects/projects-index.css
else
    echo "❌ projects-index.css missing on server"
    exit 1
fi
ENDSSH

# Step 5: Verify server is running and can serve files
echo ""
echo "🔍 Step 5: Checking server health..."
HEALTH_CHECK=$(ssh root@$DROPLET_IP "curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/health 2>/dev/null || echo '000'")
if [ "$HEALTH_CHECK" = "200" ]; then
    echo "✅ Server is running and healthy"
else
    echo "⚠️  Server health check returned: $HEALTH_CHECK"
    echo "   Attempting to restart server..."
    ssh root@$DROPLET_IP << ENDSSH
cd $APP_DIR
if command -v pm2 &> /dev/null; then
    pm2 restart abcotronics-erp 2>/dev/null || pm2 start server.js --name abcotronics-erp
    sleep 3
    echo "   Server restart attempted"
else
    echo "   PM2 not available - manual restart may be required"
fi
ENDSSH
fi

# Step 6: Test file accessibility via HTTP
echo ""
echo "🔍 Step 6: Testing file accessibility..."
VITE_JS_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMAIN/vite-projects/projects-module.js" 2>/dev/null || echo "000")
VITE_CSS_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMAIN/vite-projects/projects-index.css" 2>/dev/null || echo "000")

if [ "$VITE_JS_STATUS" = "200" ] && [ "$VITE_CSS_STATUS" = "200" ]; then
    echo "✅ Files are accessible via HTTP (200 OK)"
elif [ "$VITE_JS_STATUS" = "502" ] || [ "$VITE_CSS_STATUS" = "502" ]; then
    echo "❌ Files return 502 Bad Gateway - server may be down"
    echo "   Run on server: ./fix-502-immediate.sh"
    echo "   Or: pm2 restart abcotronics-erp"
elif [ "$VITE_JS_STATUS" = "404" ] || [ "$VITE_CSS_STATUS" = "404" ]; then
    echo "⚠️  Files return 404 - check nginx configuration"
    echo "   Ensure /vite-projects/ location is proxied correctly"
else
    echo "⚠️  Files returned: JS=$VITE_JS_STATUS, CSS=$VITE_CSS_STATUS"
fi

echo ""
echo "========================================="
echo "✅ Deployment complete!"
echo "========================================="
echo ""
echo "🧪 Test your deployment:"
echo "   1. Visit: https://$DOMAIN"
echo "   2. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)"
echo "   3. Check browser console - should see: '✅ Vite Projects module script loaded successfully'"
echo ""
echo "📊 If issues persist:"
echo "   - Check server logs: ssh root@$DROPLET_IP 'pm2 logs abcotronics-erp'"
echo "   - Check nginx logs: ssh root@$DROPLET_IP 'tail -50 /var/log/nginx/error.log'"
echo "   - Restart server: ssh root@$DROPLET_IP 'pm2 restart abcotronics-erp'"
echo "   - Run diagnostic: ssh root@$DROPLET_IP 'cd $APP_DIR && ./fix-502-immediate.sh'"
echo ""

