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
echo "📊 If issues persist, check server logs:"
echo "   ssh root@$DROPLET_IP 'pm2 logs abcotronics-erp'"
echo ""

