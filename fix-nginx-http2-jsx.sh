#!/bin/bash
# Fix HTTP2 protocol errors for JSX files
# Run this on your server: bash fix-nginx-http2-jsx.sh

set -e

echo "🔧 Fixing Nginx HTTP2 configuration for JSX files..."
echo "=================================================="

DOMAIN="abcoafrica.co.za"
APP_PORT="3000"

# Backup current config
cp /etc/nginx/sites-available/abcotronics-erp /etc/nginx/sites-available/abcotronics-erp.backup.$(date +%Y%m%d_%H%M%S)

# Create updated nginx config
cat > /etc/nginx/sites-available/abcotronics-erp <<EOF
# HTTP server - redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};
    
    # Allow Let's Encrypt challenges
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    # Redirect all other HTTP traffic to HTTPS
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    # http2 on; # Temporarily disabled due to protocol errors
    server_name ${DOMAIN} www.${DOMAIN};

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    
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
    
    # HTTP2 optimizations
    # Note: http2_push_preload is obsolete in newer nginx versions

    # JSX files - set proper MIME type to prevent HTTP2 errors
    location ~* \.jsx$ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # Override Content-Type from Express
        proxy_hide_header Content-Type;
        add_header Content-Type "application/javascript; charset=utf-8" always;
        
        expires 1h;
        add_header Cache-Control "public" always;
    }

    # Other static assets
    location ~* \.(js|css|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot|json)$ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        expires 30d;
        add_header Cache-Control "public, immutable" always;
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
        
        # Disable caching for dynamic content
        proxy_cache_bypass \$http_upgrade;
        proxy_no_cache \$http_upgrade;
    }
}
EOF

echo ""
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
    echo "✅ Done! Nginx has been updated."
    echo ""
    echo "Changes made:"
    echo "  - Added .jsx to static asset handling"
    echo "  - Set proper Content-Type for .jsx files"
    echo "  - Disabled HTTP2 push to prevent protocol errors"
    echo "  - Adjusted caching headers"
else
    echo "❌ Configuration test failed!"
    echo "Restoring backup..."
    cp /etc/nginx/sites-available/abcotronics-erp.backup.* /etc/nginx/sites-available/abcotronics-erp
    echo "Backup restored. Please check the configuration manually."
    exit 1
fi

