#!/bin/bash
# Fix HTTP/2 protocol errors in nginx configuration
# Run this on your DigitalOcean droplet as root

set -e

DOMAIN="abcoafrica.co.za"
APP_NAME="abcotronics-erp"
APP_PORT="3000"

echo "🔧 Fixing HTTP/2 protocol errors..."
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
    listen 443 ssl;          # modern nginx prefers enabling http2 separately
    listen [::]:443 ssl;     # modern nginx prefers enabling http2 separately
    http2 on;                # enable HTTP/2 using the dedicated directive
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
    
    # Header and connection tuning for large headers and many requests
    large_client_header_buffers 8 32k;
    keepalive_requests 1000;

    # Enable gzip compression for faster loads
    gzip on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript text/javascript application/x-javascript application/xml application/xml+rss image/svg+xml;

    # Proxy to Node.js app
    location / {
        proxy_pass http://localhost:APP_PORT_PLACEHOLDER;
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
        
        # Proper buffering for HTTP/2 - fixes protocol errors
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

    # Cache static assets
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:APP_PORT_PLACEHOLDER;
        proxy_set_header Host $host;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        
        # Proper buffering for static files
        proxy_buffering on;
        proxy_buffer_size 8k;
        proxy_buffers 16 8k;
    }
    
    # Special handling for JSX files (no caching, proper buffering)
    location ~* \.jsx$ {
        proxy_pass http://localhost:APP_PORT_PLACEHOLDER;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # No cache for dynamic JSX files
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        expires 0;
        
        # Proper buffering
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
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
    LATEST_BACKUP=$(ls -t /etc/nginx/sites-available/${APP_NAME}.backup.* 2>/dev/null | head -n1)
    if [ -n "$LATEST_BACKUP" ]; then
        cp -f "$LATEST_BACKUP" /etc/nginx/sites-available/$APP_NAME
        echo "   ↩️  Restored from $LATEST_BACKUP"
    else
        echo "   ⚠️  No backup found to restore. Please fix config manually."
    fi
    exit 1
fi

# Reload nginx
echo ""
echo "🔄 Reloading nginx..."
systemctl reload nginx
echo "   ✅ Nginx reloaded"

echo ""
echo "========================================="
echo "✅ HTTP/2 Fix Applied!"
echo "========================================="
echo ""
echo "📋 Changes made:"
echo "   ✅ Updated HTTP/2 buffer settings"
echo "   ✅ Enabled proper proxy buffering"
echo "   ✅ Added special handling for JSX files"
echo "   ✅ Increased http2_max_requests"
echo ""
echo "🧪 Test your site:"
echo "   1. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)"
echo "   2. Check browser console for errors"
echo "   3. Monitor nginx logs: tail -f /var/log/nginx/error.log"
echo ""
echo "📊 If errors persist, you can disable HTTP/2 temporarily:"
echo "   Edit /etc/nginx/sites-available/$APP_NAME"
echo "   Change: listen 443 ssl http2;"
echo "   To: listen 443 ssl;"
echo "   Then: systemctl reload nginx"
echo ""

