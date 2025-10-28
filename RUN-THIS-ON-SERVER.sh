#!/bin/bash
# Copy and paste this entire script on your server

set -e

echo "🔧 Fixing HTTP/2 Protocol Errors"
echo "=================================="

# Backup
cp /etc/nginx/sites-available/abcotronics-erp /etc/nginx/sites-available/abcotronics-erp.backup.$(date +%Y%m%d_%H%M%S)
echo "✅ Backed up config"

# Remove http2 from listen directives
sed -i 's/listen 443 ssl http2;/listen 443 ssl;/g' /etc/nginx/sites-available/abcotronics-erp
sed -i 's/listen \[::\]:443 ssl http2;/listen [::]:443 ssl;/g' /etc/nginx/sites-available/abcotronics-erp
echo "✅ Removed HTTP/2 from listen directives"

# Add buffer settings if not present
if ! grep -q "proxy_buffer_size" /etc/nginx/sites-available/abcotronics-erp; then
    sed -i '/client_max_body_size/a\
    # Increase buffer sizes\
    proxy_buffer_size 128k;\
    proxy_buffers 4 256k;\
    proxy_busy_buffers_size 256k;\
    proxy_temp_file_write_size 256k;' /etc/nginx/sites-available/abcotronics-erp
    echo "✅ Added proxy buffer settings"
fi

# Disable buffering if not present
if ! grep -q "proxy_buffering off" /etc/nginx/sites-available/abcotronics-erp; then
    sed -i '/proxy_read_timeout/a\
        # Disable buffering\
        proxy_buffering off;\
        proxy_request_buffering off;' /etc/nginx/sites-available/abcotronics-erp
    echo "✅ Disabled proxy buffering"
fi

# Test and reload
echo ""
echo "🧪 Testing nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Configuration is valid"
    echo "🔄 Reloading nginx..."
    systemctl reload nginx
    echo ""
    echo "✅✅✅ SUCCESS! HTTP/2 fix applied!"
    echo ""
    echo "📝 Now hard refresh your browser (Ctrl+Shift+R) and test the app"
else
    echo "❌ Configuration test failed"
    exit 1
fi

