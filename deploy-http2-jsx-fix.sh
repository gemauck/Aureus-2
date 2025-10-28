#!/bin/bash
# Fix HTTP/2 Protocol Errors for JSX files
# Run this on your DigitalOcean droplet as root

set -e

DOMAIN="abcoafrica.co.za"
APP_NAME="abcotronics-erp"
APP_PORT="3000"

echo "🔧 Fixing HTTP/2 Protocol Errors for JSX files..."
echo ""

# Backup current config
echo "📋 Backing up current nginx config..."
cp /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-available/$APP_NAME.backup.$(date +%Y%m%d_%H%M%S)

# Update nginx configuration
echo "🔧 Updating nginx configuration..."
cat > /etc/nginx/sites-available/$APP_NAME <<'NGINX_EOF'
# HTTP server - redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name DOMAIN_PLACEHOLDER www.DOMAIN_PLACEHOLDER;

    # Allow Let's Encrypt validation
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all HTTP to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name DOMAIN_PLACEHOLDER www.DOMAIN_PLACEHOLDER;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem;
    
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
    
    # HTTP/2 optimizations - using newer nginx syntax
    large_client_header_buffers 8 64k;
    keepalive_requests 10000;

    # Special handling for JSX files (must come before general location)
    location ~* \.jsx$ {
        proxy_pass http://127.0.0.1:APP_PORT_PLACEHOLDER;
        proxy_http_version 1.1;
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CRITICAL: Proper buffering for HTTP/2 with JSX files
        proxy_buffering on;
        proxy_buffer_size 8k;
        proxy_buffers 16 8k;
        proxy_busy_buffers_size 16k;
        proxy_temp_file_write_size 32k;
        proxy_max_temp_file_size 0;  # Disable temp files for better performance
        
        # Read timeout for JSX transformation
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
        
        # No caching for JSX (they're dynamic)
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        expires 0;
        
        # Disable compression for JSX (can cause HTTP/2 issues)
        proxy_set_header Accept-Encoding "";
    }
    
    # Cache static assets (but not JSX)
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:APP_PORT_PLACEHOLDER;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        expires 30d;
        add_header Cache-Control "public, immutable";
        
        # Proper buffering for static files
        proxy_buffering on;
        proxy_buffer_size 8k;
        proxy_buffers 16 8k;
    }

    # Proxy to Node.js app for everything else
    location / {
        proxy_pass http://127.0.0.1:APP_PORT_PLACEHOLDER;
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
        
        # Proper buffering for HTTP/2
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        proxy_busy_buffers_size 8k;
        proxy_temp_file_write_size 16k;
        
        # Request buffering
        proxy_request_buffering on;
        
        # Disable caching for dynamic content
        proxy_cache_bypass $http_upgrade;
        proxy_no_cache $http_upgrade;
    }
}
NGINX_EOF

# Replace placeholders
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/nginx/sites-available/$APP_NAME
sed -i "s/APP_PORT_PLACEHOLDER/$APP_PORT/g" /etc/nginx/sites-available/$APP_NAME

echo "   ✅ Configuration updated"

# Test nginx configuration
echo ""
echo "🔍 Testing nginx configuration..."
if nginx -t; then
    echo "   ✅ Configuration is valid"
else
    echo "   ❌ Configuration test failed!"
    echo "   Restoring backup..."
    cp /etc/nginx/sites-available/$APP_NAME.backup.* /etc/nginx/sites-available/$APP_NAME
    exit 1
fi

# Reload nginx
echo ""
echo "🔄 Reloading nginx..."
systemctl reload nginx
echo "   ✅ Nginx reloaded"

echo ""
echo "========================================="
echo "✅ HTTP/2 JSX Fix Applied!"
echo "========================================="
echo ""
echo "📋 Changes made:"
echo "   ✅ Added special location block for .jsx files"
echo "   ✅ Increased HTTP/2 buffer sizes"
echo "   ✅ Improved proxy buffering for JSX files"
echo "   ✅ Disabled compression for JSX (prevents HTTP/2 errors)"
echo "   ✅ Increased timeouts for JSX transformation"
echo ""
echo "🧪 Test your site:"
echo "   1. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)"
echo "   2. Check browser console for errors"
echo "   3. Verify JSX files load without ERR_HTTP2_PROTOCOL_ERROR"
echo ""
echo "📊 If errors persist, check nginx logs:"
echo "   tail -f /var/log/nginx/error.log"
echo ""

