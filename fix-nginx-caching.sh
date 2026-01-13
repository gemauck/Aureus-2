#!/bin/bash
# Fix Nginx caching to ensure latest code is served
# This script disables aggressive caching for JS/CSS/HTML files

set -e

echo "🔧 Fixing Nginx caching configuration..."
echo ""

# Find the nginx config file
NGINX_CONFIG="/etc/nginx/sites-available/abcotronics-erp"
if [ ! -f "$NGINX_CONFIG" ]; then
    NGINX_CONFIG="/etc/nginx/sites-enabled/abcotronics-erp"
fi

if [ ! -f "$NGINX_CONFIG" ]; then
    echo "❌ Nginx config not found. Looking for default config..."
    NGINX_CONFIG="/etc/nginx/sites-available/default"
fi

if [ ! -f "$NGINX_CONFIG" ]; then
    echo "❌ ERROR: Could not find nginx configuration file"
    echo "   Please specify the path to your nginx config file"
    exit 1
fi

echo "📝 Found nginx config: $NGINX_CONFIG"
echo ""

# Backup original config
BACKUP_FILE="${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"
cp "$NGINX_CONFIG" "$BACKUP_FILE"
echo "✅ Backed up config to: $BACKUP_FILE"
echo ""

# Get the app port (default 3000)
APP_PORT="${APP_PORT:-3000}"

# Create new config with proper cache headers
cat > "$NGINX_CONFIG" <<EOF
# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name abcoafrica.co.za www.abcoafrica.co.za;
    return 301 https://\$host\$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name abcoafrica.co.za www.abcoafrica.co.za;

    # SSL certificates
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
    client_max_body_size 10M;
    
    # CRITICAL: HTML files - NO CACHING (must always fetch latest)
    location = /index.html {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # CRITICAL: Force no-cache for HTML
        proxy_hide_header Cache-Control;
        proxy_hide_header Expires;
        proxy_hide_header Pragma;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
    }
    
    # CRITICAL: JavaScript files - NO CACHING (version parameters handle cache-busting)
    location ~* \.(js|jsx)$ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # CRITICAL: Force no-cache for JS files
        proxy_hide_header Cache-Control;
        proxy_hide_header Expires;
        proxy_hide_header Pragma;
        add_header Cache-Control "no-cache, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
        
        # Proper Content-Type
        proxy_hide_header Content-Type;
        add_header Content-Type "application/javascript; charset=utf-8" always;
    }
    
    # CRITICAL: CSS files - NO CACHING (version parameters handle cache-busting)
    location ~* \.css$ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # CRITICAL: Force no-cache for CSS files
        proxy_hide_header Cache-Control;
        proxy_hide_header Expires;
        proxy_hide_header Pragma;
        add_header Cache-Control "no-cache, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
    }
    
    # JSON files (build-version.json, etc.) - NO CACHING
    location ~* \.json$ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # CRITICAL: Force no-cache for JSON files
        proxy_hide_header Cache-Control;
        proxy_hide_header Expires;
        proxy_hide_header Pragma;
        add_header Cache-Control "no-cache, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
    }
    
    # Images and fonts - CAN cache (these don't change often)
    location ~* \.(jpg|jpeg|png|gif|ico|svg|webp|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable" always;
    }
    
    # Proxy to Node.js app for all other requests
    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        
        # WebSocket support
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # Headers
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
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
        
        # Disable caching for dynamic content
        proxy_cache_bypass \$http_upgrade;
        proxy_no_cache \$http_upgrade;
    }
}
EOF

echo "✅ Nginx configuration updated"
echo ""

# Test configuration
echo "🧪 Testing Nginx configuration..."
if nginx -t; then
    echo "✅ Configuration is valid"
    echo ""
    echo "🔄 Reloading Nginx..."
    systemctl reload nginx
    echo ""
    echo "✅ Done! Nginx has been updated with proper cache headers."
    echo ""
    echo "Changes made:"
    echo "  - HTML files: no-cache (always fetch latest)"
    echo "  - JS/JSX files: no-cache (version parameters handle cache-busting)"
    echo "  - CSS files: no-cache (version parameters handle cache-busting)"
    echo "  - JSON files: no-cache (build-version.json, etc.)"
    echo "  - Images/Fonts: 30d cache (these don't change often)"
    echo ""
    echo "⚠️  IMPORTANT: Clear browser cache after this change!"
    echo "   Press Ctrl+Shift+R (Cmd+Shift+R on Mac) to hard refresh"
else
    echo "❌ Configuration test failed!"
    echo "   Restoring backup..."
    cp "$BACKUP_FILE" "$NGINX_CONFIG"
    echo "   Backup restored. Please check the configuration manually."
    exit 1
fi




