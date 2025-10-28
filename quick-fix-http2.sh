#!/bin/bash
# Quick fix for HTTP/2 protocol errors
# Run this on your server: bash quick-fix-http2.sh

set -e

echo "🔧 Quick fix for HTTP/2 protocol errors"
echo "========================================"
echo ""

# Backup current config
NGINX_CONFIG="/etc/nginx/sites-available/abcotronics-erp"
if [ -f "$NGINX_CONFIG" ]; then
    cp "$NGINX_CONFIG" "${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"
    echo "✅ Backed up current config"
fi

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run as root: sudo bash quick-fix-http2.sh"
    exit 1
fi

# Update the nginx config file
sed -i 's/listen 443 ssl http2;/listen 443 ssl;/g' "$NGINX_CONFIG"
sed -i 's/listen \[::\]:443 ssl http2;/listen [::]:443 ssl;/g' "$NGINX_CONFIG"

# Check if proxy buffer settings exist, if not add them before location /
if ! grep -q "proxy_buffer_size" "$NGINX_CONFIG"; then
    sed -i '/client_max_body_size/a\\n    # Increase buffer sizes to handle large responses\n    proxy_buffer_size 128k;\n    proxy_buffers 4 256k;\n    proxy_busy_buffers_size 256k;\n    proxy_temp_file_write_size 256k;' "$NGINX_CONFIG"
fi

# Check if proxy_buffering is disabled, if not add it
if ! grep -q "proxy_buffering off" "$NGINX_CONFIG"; then
    sed -i '/proxy_read_timeout/a\\n        # Disable buffering for streaming responses\n        proxy_buffering off;\n        proxy_request_buffering off;' "$NGINX_CONFIG"
fi

echo "✅ Updated nginx configuration"

# Test configuration
echo ""
echo "🧪 Testing nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Configuration is valid"
    echo ""
    echo "🔄 Reloading nginx..."
    systemctl reload nginx
    echo ""
    echo "✅ Done! HTTP/2 has been disabled."
    echo ""
    echo "📝 Changes:"
    echo "   - Removed 'http2' from listen directives"
    echo "   - Added proxy buffer configurations"
    echo "   - Disabled proxy buffering"
    echo ""
    echo "🌐 Test your app now - it should load without ERR_HTTP2_PROTOCOL_ERROR"
else
    echo "❌ Configuration test failed"
    exit 1
fi

