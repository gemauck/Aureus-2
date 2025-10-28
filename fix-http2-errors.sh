#!/bin/bash
# Fix HTTP/2 Protocol Errors
# This disables HTTP/2 which is causing connection issues

set -e

echo "🔧 Fixing HTTP/2 Protocol Errors"
echo "=================================="
echo ""

# Backup current config
if [ -f /etc/nginx/sites-available/abcotronics-erp ]; then
    cp /etc/nginx/sites-available/abcotronics-erp /etc/nginx/sites-available/abcotronics-erp.backup.$(date +%Y%m%d_%H%M%S)
    echo "✅ Backed up current nginx config"
fi

# Create new nginx configuration without HTTP/2
cat > /etc/nginx/sites-available/abcotronics-erp <<'EOF'
server {
    listen 80;
    server_name abcoafrica.co.za www.abcoafrica.co.za;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name abcoafrica.co.za www.abcoafrica.co.za;
    
    ssl_certificate /etc/letsencrypt/live/abcoafrica.co.za/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/abcoafrica.co.za/privkey.pem;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Large file uploads
    client_max_body_size 50M;
    
    # Increase buffer sizes to handle large responses
    proxy_buffer_size 128k;
    proxy_buffers 4 256k;
    proxy_busy_buffers_size 256k;
    proxy_temp_file_write_size 256k;
    
    # Proxy to Node.js app
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Disable buffering for streaming responses
        proxy_buffering off;
        proxy_request_buffering off;
        
        # Disable caching for dynamic content
        proxy_cache_bypass $http_upgrade;
        proxy_no_cache $http_upgrade;
    }
}
EOF

echo "✅ Nginx configuration updated (HTTP/2 disabled)"

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
    echo "✅ Nginx reloaded successfully!"
    echo ""
    echo "🎉 HTTP/2 has been disabled. The app should now load without protocol errors."
    echo ""
    echo "📝 Changes made:"
    echo "   - Removed 'http2' from listen directive"
    echo "   - Added proxy buffer size configurations"
    echo "   - Disabled proxy buffering for better streaming"
    echo "   - Increased timeouts"
else
    echo "❌ Configuration test failed. Restoring backup..."
    if [ -f /etc/nginx/sites-available/abcotronics-erp.backup.* ]; then
        RESTORE_FILE=$(ls -t /etc/nginx/sites-available/abcotronics-erp.backup.* | head -1)
        cp "$RESTORE_FILE" /etc/nginx/sites-available/abcotronics-erp
        echo "✅ Backup restored"
    fi
    exit 1
fi

