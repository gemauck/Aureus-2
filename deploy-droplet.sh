#!/bin/bash
# Complete deployment to DigitalOcean droplet
# Deploys code and updates nginx configuration

set -e

DROPLET_IP="165.22.127.196"
DOMAIN="abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"
APP_PORT="3000"

echo "🚀 Deploying to DigitalOcean Droplet"
echo "======================================"
echo "IP: $DROPLET_IP"
echo "Domain: $DOMAIN"
echo ""

# Step 1: Upload nginx fix script to server
echo "📤 Step 1: Uploading nginx fix script..."
scp deploy-http2-jsx-fix.sh root@$DROPLET_IP:/root/
echo "✅ Script uploaded"

# Step 2: Deploy code and update nginx
echo ""
echo "📡 Step 2: Connecting to droplet and deploying..."
ssh root@$DROPLET_IP << ENDSSH
set -e

echo "✅ Connected to droplet"
echo ""

# Navigate to app directory
cd $APP_DIR
echo "📁 Current directory: \$(pwd)"
echo ""

# Pull latest changes
echo "📥 Pulling latest changes from GitHub..."
if git pull origin main; then
    echo "✅ Code updated successfully"
else
    echo "⚠️  Git pull had conflicts, trying to resolve..."
    git stash || true
    git pull origin main
    echo "✅ Code updated after stash"
fi

echo ""
echo "🔄 Restarting application..."

# Try PM2 first
if command -v pm2 &> /dev/null; then
    echo "   Using PM2..."
    pm2 restart abcotronics-erp || pm2 restart all || pm2 start server.js --name abcotronics-erp
    pm2 save
    echo "   ✅ Application restarted with PM2"
# Try systemctl
elif systemctl list-units --type=service | grep -q abcotronics; then
    echo "   Using systemctl..."
    systemctl restart abcotronics-erp
    echo "   ✅ Application restarted with systemctl"
# Try manual restart
else
    echo "   ⚠️  No process manager found, you may need to restart manually"
    echo "   Run: node server.js (or use pm2/systemctl)"
fi

echo ""
echo "🔧 Step 3: Updating nginx configuration..."
if [ -f /root/deploy-http2-jsx-fix.sh ]; then
    chmod +x /root/deploy-http2-jsx-fix.sh
    /root/deploy-http2-jsx-fix.sh
else
    echo "   ⚠️  Nginx fix script not found at /root/deploy-http2-jsx-fix.sh"
    echo "   You can run it manually after deployment"
fi

echo ""
echo "========================================="
echo "✅ Deployment complete!"
echo "========================================="
echo ""
echo "📋 Verification:"
echo "   1. Check app status: pm2 status"
echo "   2. Check nginx: systemctl status nginx"
echo "   3. Test site: curl -I https://$DOMAIN"
echo ""

ENDSSH

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🧪 Test your deployment:"
echo "   1. Visit: https://$DOMAIN"
echo "   2. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)"
echo "   3. Check console for: '✅ App mounted successfully'"
echo ""
echo "📊 Monitor logs:"
echo "   ssh root@$DROPLET_IP 'pm2 logs abcotronics-erp'"
echo "   ssh root@$DROPLET_IP 'tail -f /var/log/nginx/error.log'"
echo ""

