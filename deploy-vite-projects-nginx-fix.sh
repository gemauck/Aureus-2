#!/bin/bash
# Deploy Vite Projects nginx fix to production server
# This ensures /vite-projects/ requests are proxied to Node.js app

set -e

echo "🚀 Deploying Vite Projects Nginx Fix to Production Server"
echo "=========================================================="
echo ""

# Server details
SERVER="root@165.22.127.196"
DOMAIN="abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"
NGINX_CONFIG_SOURCE="./deploy/nginx.conf"
NGINX_CONFIG_DEST="/etc/nginx/sites-available/abcotronics-erp"

echo "📡 Server: $SERVER"
echo "📁 App Directory: $APP_DIR"
echo ""

# Step 1: Deploy nginx config
echo "📝 Step 1: Deploying updated nginx configuration..."
scp $NGINX_CONFIG_SOURCE $SERVER:/tmp/nginx.conf
if [ $? -ne 0 ]; then
    echo "❌ Failed to upload nginx config"
    exit 1
fi
echo "✅ Nginx config uploaded"
echo ""

# Step 2: Apply nginx config on server
echo "🔧 Step 2: Applying nginx configuration on server..."
ssh $SERVER << ENDSSH
set -e

# Find nginx config directory
if [ -d "/etc/nginx/sites-available" ]; then
    CONFIG_DIR="/etc/nginx/sites-available"
    ENABLED_DIR="/etc/nginx/sites-enabled"
else
    echo "❌ Could not find nginx sites-available directory"
    exit 1
fi

# Replace domain placeholder with actual domain
sed "s/your-domain\.com/$DOMAIN/g" /tmp/nginx.conf > \$CONFIG_DIR/abcotronics-erp

# Create symlink if it doesn't exist
if [ ! -L "\$ENABLED_DIR/abcotronics-erp" ]; then
    ln -sf \$CONFIG_DIR/abcotronics-erp \$ENABLED_DIR/abcotronics-erp
fi

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
if nginx -t; then
    echo "✅ Nginx configuration is valid"
    echo "🔄 Reloading nginx..."
    systemctl reload nginx
    echo "✅ Nginx reloaded successfully"
else
    echo "❌ Nginx configuration test failed!"
    exit 1
fi

ENDSSH

if [ $? -ne 0 ]; then
    echo "❌ Failed to apply nginx config"
    exit 1
fi
echo "✅ Nginx configuration applied"
echo ""

# Step 3: Verify vite-projects files exist on server
echo "🔍 Step 3: Verifying vite-projects files on server..."
ssh $SERVER << ENDSSH
if [ -f "$APP_DIR/dist/vite-projects/projects-module.js" ]; then
    echo "✅ projects-module.js exists"
    ls -lh $APP_DIR/dist/vite-projects/projects-module.js
else
    echo "⚠️  projects-module.js not found on server"
    echo "   Run: ./deploy-vite-projects.sh to deploy the files"
fi

if [ -f "$APP_DIR/dist/vite-projects/projects-index.css" ]; then
    echo "✅ projects-index.css exists"
    ls -lh $APP_DIR/dist/vite-projects/projects-index.css
else
    echo "⚠️  projects-index.css not found on server"
    echo "   Run: ./deploy-vite-projects.sh to deploy the files"
fi
ENDSSH

echo ""
echo "========================================="
echo "✅ Deployment complete!"
echo "========================================="
echo ""
echo "📝 What was fixed:"
echo "   - Added /vite-projects/ location block to nginx"
echo "   - Requests to /vite-projects/* now proxy to Node.js app"
echo "   - Node.js app serves files from dist/vite-projects/"
echo ""
echo "🧪 Test the fix:"
echo "   1. Visit: https://$DOMAIN"
echo "   2. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)"
echo "   3. Check browser console - should see: '✅ Vite Projects module script loaded successfully'"
echo ""
echo "📊 If vite-projects files are missing, run:"
echo "   ./deploy-vite-projects.sh"
echo ""


