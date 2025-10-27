#!/bin/bash
# Complete HTTPS Setup Script for abcoafrica.com
# Run this on your DigitalOcean droplet: bash deploy-https-complete.sh

set -e

echo "🔒 Complete HTTPS Setup for abcoafrica.com"
echo "============================================"
echo ""

# Configuration
DOMAIN="abcoafrica.com"
APP_PORT="3000"

# Step 1: Update system
echo "📦 Step 1: Updating system..."
apt-get update -qq

# Step 2: Install Nginx if not installed
echo ""
echo "📦 Step 2: Installing Nginx..."
if ! command -v nginx &> /dev/null; then
    apt-get install -y nginx
else
    echo "✅ Nginx already installed"
fi

# Step 3: Create HTTP-only Nginx configuration
echo ""
echo "📝 Step 3: Creating Nginx configuration..."
cat > /etc/nginx/sites-available/abcotronics-erp <<'NGINX_EOF'
server {
    listen 80;
    server_name abcoafrica.com www.abcoafrica.com;
    
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    location /app {
        rewrite ^/app(/.*)$ $1 break;
        rewrite ^/app$ / break;
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    location / {
        return 404;
    }
}
NGINX_EOF

# Step 4: Enable site and test configuration
echo ""
echo "🔧 Step 4: Enabling site..."
ln -sf /etc/nginx/sites-available/abcotronics-erp /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test configuration
echo "🧪 Testing Nginx configuration..."
nginx -t

# Restart Nginx
echo "🔄 Restarting Nginx..."
systemctl enable nginx
systemctl restart nginx

# Step 5: Configure firewall
echo ""
echo "🔒 Step 5: Configuring firewall..."
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw allow 22/tcp || true
ufw --force enable 2>/dev/null || true

# Step 6: Install Certbot if not installed
echo ""
echo "📦 Step 6: Installing Certbot..."
if ! command -v certbot &> /dev/null; then
    apt-get install -y certbot python3-certbot-nginx
else
    echo "✅ Certbot already installed"
fi

# Step 7: Get SSL certificate
echo ""
echo "🔐 Step 7: Obtaining SSL certificate..."
echo "   This may take a moment..."

if certbot --nginx -d abcoafrica.com -d www.abcoafrica.com --non-interactive --agree-tos --redirect --register-unsafely-without-email; then
    echo "✅ SSL certificate obtained successfully"
else
    echo "⚠️  Certificate obtainment failed. Possible reasons:"
    echo "   - DNS not configured properly"
    echo "   - DNS hasn't propagated yet (can take 15 minutes to 48 hours)"
    echo ""
    echo "   Continue anyway? The app will work with HTTP only."
    echo "   You can run certbot later to add HTTPS."
fi

# Step 8: Check app status
echo ""
echo "🔍 Step 8: Checking application status..."
if command -v pm2 &> /dev/null; then
    echo "PM2 is installed. Checking app status:"
    pm2 status || echo "No PM2 processes found"
    
    if ! pm2 status | grep -q "online"; then
        echo ""
        echo "⚠️  Warning: Your app doesn't appear to be running."
        echo "   Make sure your app is started with: pm2 start"
    fi
else
    echo "⚠️  PM2 not found. Make sure your app is running on port $APP_PORT"
fi

# Step 9: Final verification
echo ""
echo "✅ Setup Complete!"
echo ""
echo "📋 Summary:"
echo "   Domain: $DOMAIN"
echo "   App URL: https://${DOMAIN}/app"
echo "   Web Server: Nginx"
echo ""
echo "🔍 Verification Commands:"
echo "   Check Nginx: systemctl status nginx"
echo "   Check Cert: certbot certificates"
echo "   Check App: pm2 status"
echo "   View Logs: tail -f /var/log/nginx/error.log"
echo ""
echo "🌐 Your app should now be accessible at:"
echo "   https://${DOMAIN}/app"
echo ""

# Show current status
echo "📊 Current Status:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
systemctl status nginx --no-pager | head -n 3 || true
echo ""
if command -v certbot &> /dev/null; then
    certbot certificates 2>/dev/null || echo "No certificates found"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "🎉 Done! If you see any errors above, please review them."
