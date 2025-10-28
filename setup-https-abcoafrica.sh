#!/bin/bash
# HTTPS Setup Script for abcoafrica.com
# Run this on your DigitalOcean droplet

set -e  # Exit on error

DOMAIN="abcoafrica.com"
APP_NAME="abcotronics-erp"
APP_DIR="/var/www/abcotronics-erp"
APP_PORT="3000"
DROPLET_IP="138.68.167.88"

echo "🔒 HTTPS Setup for abcoafrica.com"
echo "=================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run as root"
    exit 1
fi

echo "📋 Configuration:"
echo "   Domain: $DOMAIN"
echo "   Droplet IP: $DROPLET_IP"
echo "   App Port: $APP_PORT"
echo ""

read -p "Have you configured DNS A records to point $DOMAIN to $DROPLET_IP? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Please configure DNS first at domains.co.za"
    echo "   Create A records pointing to $DROPLET_IP"
    exit 1
fi

echo ""
echo "🔧 Step 1: Updating system..."
apt-get update -qq

echo ""
echo "🔧 Step 2: Installing Nginx..."
apt-get install -y nginx

echo ""
echo "🔧 Step 3: Creating Nginx configuration for abcoafrica.com..."
cat > /etc/nginx/sites-available/$APP_NAME <<EOF
# HTTP server - redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    # Allow Let's Encrypt validation
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all HTTP to HTTPS
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    # SSL certificates (will be added by certbot)
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    
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
    
    # Increase buffer sizes to handle large responses (prevents HTTP/2 protocol errors)
    proxy_buffer_size 128k;
    proxy_buffers 4 256k;
    proxy_busy_buffers_size 256k;
    proxy_temp_file_write_size 256k;

    # Proxy to Node.js app
    location / {
        proxy_pass http://localhost:$APP_PORT;
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
        
        # Disable buffering for streaming responses (prevents HTTP/2 errors)
        proxy_buffering off;
        proxy_request_buffering off;
        
        # Disable caching for dynamic content
        proxy_cache_bypass \$http_upgrade;
        proxy_no_cache \$http_upgrade;
    }

    # Cache static assets
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:$APP_PORT;
        proxy_set_header Host \$host;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

echo "   ✅ Nginx configuration created"

echo ""
echo "🔧 Step 4: Enabling Nginx site..."
ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

echo "🔧 Step 5: Testing Nginx configuration..."
nginx -t

echo ""
echo "🔧 Step 6: Starting Nginx..."
systemctl enable nginx
systemctl restart nginx

echo ""
echo "🔧 Step 7: Installing Certbot for SSL certificates..."
apt-get install -y certbot python3-certbot-nginx

echo ""
echo "🔧 Step 8: Obtaining SSL certificate for abcoafrica.com..."
echo "   This may take a minute..."

# Try to get certificate
if certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --redirect --register-unsafely-without-email; then
    echo "   ✅ SSL certificate obtained successfully"
else
    echo "   ⚠️  Failed to obtain certificate. This usually means DNS isn't propagated yet."
    echo "   Waiting 30 seconds and trying again..."
    sleep 30
    
    if certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --redirect --register-unsafely-without-email; then
        echo "   ✅ SSL certificate obtained successfully"
    else
        echo "   ❌ Could not obtain certificate"
        echo "   Please check:"
        echo "   - DNS A records are pointing to $DROPLET_IP"
        echo "   - DNS has propagated (can take up to 48 hours)"
        echo "   Run this command manually later: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
    fi
fi

echo ""
echo "🔧 Step 9: Configuring firewall..."
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw status | head -10

echo ""
echo "🔧 Step 10: Updating application configuration..."

# Update .env file
if [ -d "$APP_DIR" ]; then
    if [ -f "$APP_DIR/.env" ]; then
        echo "   Updating APP_URL in .env..."
        
        if grep -q "^APP_URL=" "$APP_DIR/.env"; then
            sed -i "s|^APP_URL=.*|APP_URL=https://$DOMAIN|" "$APP_DIR/.env"
        else
            echo "APP_URL=https://$DOMAIN" >> "$APP_DIR/.env"
        fi
        echo "   ✅ .env updated"
    fi

    echo ""
    echo "🔧 Step 11: Restarting application..."
    cd "$APP_DIR"
    pm2 restart $APP_NAME || echo "   ⚠️  Could not restart app. Check manually with: pm2 status"
else
    echo "   ⚠️  App directory not found at $APP_DIR"
fi

echo ""
echo "========================================="
echo "✅ HTTPS Setup Complete!"
echo "========================================="
echo ""
echo "📋 Summary:"
echo "   ✅ Nginx installed and configured"
echo "   ✅ SSL certificate obtained (if DNS was ready)"
echo "   ✅ HTTP to HTTPS redirect active"
echo "   ✅ App restarted"
echo ""
echo "🔍 Test your setup:"
echo "   1. Visit: https://abcoafrica.com"
echo "   2. Check SSL: https://www.ssllabs.com/ssltest/analyze.html?d=abcoafrica.com"
echo ""
echo "📝 Next Steps:"
echo "   1. Add these lines to server.js in allowedOrigins array:"
echo "      'https://abcoafrica.com',"
echo "      'https://www.abcoafrica.com'"
echo "   2. Commit and push: git push origin main"
echo "   3. Pull on droplet: cd $APP_DIR && git pull"
echo "   4. Restart: pm2 restart $APP_NAME"
echo ""
echo "🔐 Security Features:"
echo "   ✅ TLS 1.2 and 1.3 enabled"
echo "   ✅ Strong ciphers configured"
echo "   ✅ HSTS header enabled"
echo "   ✅ Certificate auto-renewal configured"
echo ""
echo "📊 Monitor Logs:"
echo "   Nginx: tail -f /var/log/nginx/error.log"
echo "   App: pm2 logs $APP_NAME"
echo ""
echo "Certificate auto-renewal is configured. Check status: certbot certificates"

