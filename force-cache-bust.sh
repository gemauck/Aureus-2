#!/bin/bash
# Force cache busting on production server

set -e

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "🔄 Forcing cache bust on production server..."
echo ""

ssh $SERVER << 'CACHEBUST'
set -e

cd /var/www/abcotronics-erp

echo "📦 Generating new cache-bust version..."
CACHE_BUST_VERSION=$(date +%s)
echo "$CACHE_BUST_VERSION" > .cache-version
echo "✅ Cache version set to: $CACHE_BUST_VERSION"

# Update APP_VERSION in .env
APP_VERSION=$(git rev-parse --short HEAD 2>/dev/null || echo "$(date +%s)")
APP_BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [ -f .env ]; then
    sed -i '/^APP_VERSION=/d' .env
    sed -i '/^APP_BUILD_TIME=/d' .env
    echo "APP_VERSION=$APP_VERSION" >> .env
    echo "APP_BUILD_TIME=$APP_BUILD_TIME" >> .env
    echo "✅ Updated .env with cache-busting version: $APP_VERSION"
fi

# Clear nginx cache
echo ""
echo "🧹 Clearing nginx cache..."
if command -v nginx &> /dev/null; then
    # Clear nginx cache directory if it exists
    if [ -d /var/cache/nginx ]; then
        rm -rf /var/cache/nginx/* 2>/dev/null || true
    fi
    nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || echo "⚠️  Nginx reload skipped"
    echo "✅ Nginx cache cleared and reloaded"
fi

# Restart PM2 to pick up new environment variables
echo ""
echo "🔄 Restarting application with new cache-bust version..."
pm2 restart abcotronics-erp
echo "✅ Application restarted"

echo ""
echo "✅ Cache bust complete!"
echo "📦 New version: $APP_VERSION"
echo "📦 Build time: $APP_BUILD_TIME"
echo ""
echo "💡 Users should now see the latest changes after a hard refresh (Cmd+Shift+R / Ctrl+Shift+R)"

CACHEBUST

echo ""
echo "✅ Cache bust deployment complete!"







