#!/bin/bash
# Complete deployment script for Vite Projects module
# This script: builds, deploys, verifies, and fixes common issues

set -e

DROPLET_IP="165.22.127.196"
DOMAIN="abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Complete Vite Projects Module Deployment"
echo "============================================="
echo "IP: $DROPLET_IP"
echo "Domain: $DOMAIN"
echo ""

# Step 1: Build locally
echo "🏗️  Step 1: Building Vite Projects module locally..."
npm run build:vite-projects
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi
echo "✅ Build complete"
echo ""

# Step 2: Verify local files
echo "🔍 Step 2: Verifying local build files..."
if [ ! -f "dist/vite-projects/projects-module.js" ]; then
    echo "❌ Error: dist/vite-projects/projects-module.js not found"
    exit 1
fi
if [ ! -f "dist/vite-projects/projects-index.css" ]; then
    echo "❌ Error: dist/vite-projects/projects-index.css not found"
    exit 1
fi
echo "✅ Files verified locally"
FILESIZE_JS=$(ls -lh dist/vite-projects/projects-module.js | awk '{print $5}')
FILESIZE_CSS=$(ls -lh dist/vite-projects/projects-index.css | awk '{print $5}')
echo "   - projects-module.js: $FILESIZE_JS"
echo "   - projects-index.css: $FILESIZE_CSS"
echo ""

# Step 3: Deploy to server
echo "📤 Step 3: Deploying files to server..."
scp -r dist/vite-projects root@$DROPLET_IP:$APP_DIR/dist/
if [ $? -ne 0 ]; then
    echo "❌ Deployment failed - check SSH access"
    exit 1
fi
echo "✅ Files deployed"
echo ""

# Step 4: Verify files on server
echo "🔍 Step 4: Verifying files on server..."
ssh root@$DROPLET_IP << ENDSSH
cd $APP_DIR
if [ -f "dist/vite-projects/projects-module.js" ]; then
    echo "✅ projects-module.js exists on server"
    ls -lh dist/vite-projects/projects-module.js
else
    echo "❌ projects-module.js missing on server"
    exit 1
fi
if [ -f "dist/vite-projects/projects-index.css" ]; then
    echo "✅ projects-index.css exists on server"
    ls -lh dist/vite-projects/projects-index.css
else
    echo "❌ projects-index.css missing on server"
    exit 1
fi

# Verify file permissions
echo "Checking file permissions..."
ls -la dist/vite-projects/ | head -5
ENDSSH

# Step 5: Check server health
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
    echo "   Restarting with PM2..."
    pm2 restart abcotronics-erp 2>/dev/null || {
        echo "   Starting new PM2 process..."
        pm2 start server.js --name abcotronics-erp
        pm2 save
    }
    sleep 3
    echo "   Server restart attempted"
else
    echo "   PM2 not available - manual restart may be required"
fi
ENDSSH
    
    # Wait and recheck
    sleep 3
    HEALTH_CHECK=$(ssh root@$DROPLET_IP "curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/health 2>/dev/null || echo '000'")
    if [ "$HEALTH_CHECK" = "200" ]; then
        echo "✅ Server is now running after restart"
    else
        echo "⚠️  Server still not responding. Check logs:"
        echo "   ssh root@$DROPLET_IP 'pm2 logs abcotronics-erp --lines 20'"
    fi
fi

# Step 6: Test file accessibility via HTTP
echo ""
echo "🔍 Step 6: Testing file accessibility via HTTP..."
sleep 2  # Give server time to process

VITE_JS_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMAIN/vite-projects/projects-module.js?v=test" 2>/dev/null || echo "000")
VITE_CSS_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMAIN/vite-projects/projects-index.css?v=test" 2>/dev/null || echo "000")

if [ "$VITE_JS_STATUS" = "200" ] && [ "$VITE_CSS_STATUS" = "200" ]; then
    echo "✅ ✅ ✅ Files are accessible via HTTP (200 OK)"
    echo "   - projects-module.js: HTTP $VITE_JS_STATUS"
    echo "   - projects-index.css: HTTP $VITE_CSS_STATUS"
elif [ "$VITE_JS_STATUS" = "502" ] || [ "$VITE_CSS_STATUS" = "502" ]; then
    echo "❌ Files return 502 Bad Gateway"
    echo "   This indicates the Node.js server is not responding to nginx"
    echo ""
    echo "   🔧 To fix, run on server:"
    echo "      ssh root@$DROPLET_IP"
    echo "      cd $APP_DIR"
    echo "      ./fix-502-immediate.sh"
    echo ""
    echo "   Or manually:"
    echo "      pm2 restart abcotronics-erp"
    echo "      pm2 logs abcotronics-erp --lines 50"
elif [ "$VITE_JS_STATUS" = "404" ] || [ "$VITE_CSS_STATUS" = "404" ]; then
    echo "⚠️  Files return 404 Not Found"
    echo "   Check nginx configuration for /vite-projects/ location block"
    echo "   Run: ./deploy-vite-projects-nginx-fix.sh"
else
    echo "⚠️  Files returned unexpected status codes:"
    echo "   - projects-module.js: HTTP $VITE_JS_STATUS"
    echo "   - projects-index.css: HTTP $VITE_CSS_STATUS"
    echo "   Check server and nginx configuration"
fi

echo ""
echo "========================================="
echo "✅ Deployment process complete!"
echo "========================================="
echo ""
echo "📋 Summary:"
echo "   - Files built: ✅"
echo "   - Files deployed: ✅"
echo "   - Server health: $([ "$HEALTH_CHECK" = "200" ] && echo "✅" || echo "⚠️")"
echo "   - HTTP accessibility: $([ "$VITE_JS_STATUS" = "200" ] && [ "$VITE_CSS_STATUS" = "200" ] && echo "✅" || echo "⚠️")"
echo ""
echo "🧪 Next steps:"
echo "   1. Visit: https://$DOMAIN"
echo "   2. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)"
echo "   3. Open browser console (F12)"
echo "   4. Look for: '✅ Vite Projects module script loaded successfully'"
echo ""
echo "📊 If issues persist:"
if [ "$VITE_JS_STATUS" != "200" ] || [ "$VITE_CSS_STATUS" != "200" ]; then
    echo "   - Check server status: ssh root@$DROPLET_IP 'pm2 status'"
    echo "   - Check server logs: ssh root@$DROPLET_IP 'pm2 logs abcotronics-erp --lines 50'"
    echo "   - Check nginx logs: ssh root@$DROPLET_IP 'tail -50 /var/log/nginx/error.log'"
    echo "   - Run diagnostic: ssh root@$DROPLET_IP 'cd $APP_DIR && ./fix-502-immediate.sh'"
    echo "   - Verify nginx config: ssh root@$DROPLET_IP 'nginx -t'"
else
    echo "   - Clear browser cache and hard refresh"
    echo "   - Check browser console for any JavaScript errors"
fi
echo ""


