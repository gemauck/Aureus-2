#!/bin/bash
# Deploy Nginx cache fix to production server
# This ensures index.html is never cached so users always get the latest version

set -e

echo "🚀 Deploying Nginx cache fix to production server..."
echo ""

# Server details (from deploy-to-server.sh)
SERVER="root@abcoafrica.co.za"
NGINX_CONFIG_SOURCE="./deploy/nginx.conf"
NGINX_CONFIG_DEST="/etc/nginx/sites-available/abcotronics-erp"

echo "📡 Connecting to server: $SERVER"
echo ""

ssh $SERVER << ENDSSH
set -e

echo "✅ Connected to server"
echo ""

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "⚠️  Nginx is not installed on this server"
    echo "   The Node.js server already has proper cache headers, so this is optional"
    exit 0
fi

# Find the actual nginx config location
NGINX_CONF=\$(nginx -t 2>&1 | grep "configuration file" | awk '{print \$NF}' | sed 's/:$//')
NGINX_DIR=\$(dirname "\$NGINX_CONF")

echo "📁 Nginx config directory: \$NGINX_DIR"
echo ""

# Check if sites-available directory exists
if [ -d "\$NGINX_DIR/sites-available" ]; then
    CONFIG_DIR="\$NGINX_DIR/sites-available"
    ENABLED_DIR="\$NGINX_DIR/sites-enabled"
elif [ -d "/etc/nginx/sites-available" ]; then
    CONFIG_DIR="/etc/nginx/sites-available"
    ENABLED_DIR="/etc/nginx/sites-enabled"
else
    echo "⚠️  Could not find nginx sites-available directory"
    echo "   Please manually copy deploy/nginx.conf to your nginx config location"
    exit 1
fi

echo "📝 Config will be placed at: \$CONFIG_DIR/abcotronics-erp"
echo ""

# Create the config file with actual domain
echo "📋 Creating/updating nginx config..."
DOMAIN="abcoafrica.co.za"
cat << 'NGINXCONFIG' | sed "s/your-domain\.com/\$DOMAIN/g" > \$CONFIG_DIR/abcotronics-erp
$(cat deploy/nginx.conf)
NGINXCONFIG

echo "✅ Config file created"
echo ""

# Create symlink in sites-enabled if it doesn't exist
if [ ! -L "\$ENABLED_DIR/abcotronics-erp" ]; then
    echo "🔗 Creating symlink in sites-enabled..."
    ln -sf \$CONFIG_DIR/abcotronics-erp \$ENABLED_DIR/abcotronics-erp
    echo "✅ Symlink created"
    echo ""
fi

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
if nginx -t; then
    echo "✅ Nginx configuration is valid"
    echo ""
    
    # Reload nginx
    echo "🔄 Reloading nginx..."
    if systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || nginx -s reload 2>/dev/null; then
        echo "✅ Nginx reloaded successfully"
        echo ""
        echo "🎉 Cache fix deployed! index.html will now always be revalidated."
    else
        echo "⚠️  Could not reload nginx automatically"
        echo "   Please run manually: sudo systemctl reload nginx"
    fi
else
    echo "❌ Nginx configuration test failed!"
    echo "   Please check the config file manually"
    exit 1
fi

ENDSSH

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Summary:"
echo "   - index.html is now served with no-cache headers"
echo "   - Static assets (JS/CSS/images) are cached for 1 year"
echo "   - Users will always get the latest version of the app"
echo ""

