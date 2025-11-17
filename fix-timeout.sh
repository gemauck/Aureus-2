#!/bin/bash
# Fix script for ERR_TIMED_OUT errors on abcoafrica.co.za
# This script checks and fixes common SSL/timeout issues

set -e

echo "🔧 Fixing ERR_TIMED_OUT Error"
echo "=============================="
echo ""

# Check if we're on the server
if [ -z "$SSH_CONNECTION" ] && [ ! -f "/var/www/abcotronics-erp/server.js" ]; then
    echo "📡 This script should be run on the server:"
    echo ""
    echo "Option 1 - SSH and run:"
    echo "   ssh root@abcoafrica.co.za"
    echo "   cd /var/www/abcotronics-erp"
    echo "   bash fix-timeout.sh"
    echo ""
    echo "Option 2 - Run remotely:"
    echo "   ssh root@abcoafrica.co.za 'bash -s' < fix-timeout.sh"
    echo ""
    exit 1
fi

APP_DIR="/var/www/abcotronics-erp"
cd "$APP_DIR" 2>/dev/null || {
    APP_DIR="$(pwd)"
    echo "⚠️  Using current directory: $APP_DIR"
}

echo "📂 Working directory: $APP_DIR"
echo ""

# 1. Check and restart Nginx
echo "1️⃣  Checking Nginx..."
if ! systemctl is-active --quiet nginx; then
    echo "❌ Nginx is not running. Starting..."
    sudo systemctl start nginx
else
    echo "✅ Nginx is running"
fi

# Test Nginx config
echo "   Testing Nginx configuration..."
if sudo nginx -t 2>&1 | grep -q "successful"; then
    echo "✅ Nginx configuration is valid"
else
    echo "❌ Nginx configuration has errors!"
    sudo nginx -t
    echo ""
    echo "⚠️  Please fix Nginx configuration errors first"
    exit 1
fi

# Reload Nginx
echo "   Reloading Nginx..."
sudo systemctl reload nginx
echo "✅ Nginx reloaded"
echo ""

# 2. Check and restart PM2 application
echo "2️⃣  Checking PM2 application..."
if command -v pm2 &> /dev/null; then
    if pm2 list | grep -q "abcotronics-erp.*online"; then
        echo "✅ PM2 app is online"
        echo "   Restarting to ensure fresh state..."
        pm2 restart abcotronics-erp
    else
        echo "⚠️  PM2 app not online. Starting..."
        cd "$APP_DIR"
        pm2 start server.js --name abcotronics-erp --update-env || {
            echo "   Trying with environment variables..."
            NODE_ENV=production APP_URL=https://abcoafrica.co.za pm2 start server.js --name abcotronics-erp
        }
        pm2 save
    fi
    echo "   Waiting for app to start..."
    sleep 3
    
    # Check if app is responding
    if curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3000/health | grep -q "200"; then
        echo "✅ Application is responding"
    else
        echo "⚠️  Application health check failed. Check logs:"
        echo "   pm2 logs abcotronics-erp --lines 30"
    fi
else
    echo "⚠️  PM2 not installed"
fi
echo ""

# 3. Check SSL certificate
echo "3️⃣  Checking SSL certificate..."
if [ -f "/etc/letsencrypt/live/abcoafrica.co.za/fullchain.pem" ]; then
    CERT_EXPIRY=$(sudo openssl x509 -enddate -noout -in /etc/letsencrypt/live/abcoafrica.co.za/fullchain.pem 2>/dev/null | cut -d= -f2)
    CERT_DATE=$(date -d "$CERT_EXPIRY" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y" "$CERT_EXPIRY" +%s 2>/dev/null || echo "0")
    NOW_DATE=$(date +%s)
    DAYS_LEFT=$(( ($CERT_DATE - $NOW_DATE) / 86400 ))
    
    if [ $DAYS_LEFT -gt 30 ]; then
        echo "✅ SSL certificate is valid (expires in $DAYS_LEFT days)"
    elif [ $DAYS_LEFT -gt 0 ]; then
        echo "⚠️  SSL certificate expires in $DAYS_LEFT days"
    else
        echo "❌ SSL certificate has expired!"
        echo "   Renewing certificate..."
        sudo certbot renew --force-renewal -d abcoafrica.co.za -d www.abcoafrica.co.za
        sudo systemctl reload nginx
    fi
else
    echo "❌ SSL certificate not found!"
    echo "   You may need to obtain a certificate:"
    echo "   sudo certbot certonly --standalone -d abcoafrica.co.za -d www.abcoafrica.co.za"
fi
echo ""

# 4. Check Nginx SSL configuration
echo "4️⃣  Checking Nginx SSL configuration..."
NGINX_CONFIG="/etc/nginx/sites-available/abcotronics-erp"
if [ -f "$NGINX_CONFIG" ]; then
    echo "✅ Nginx config file exists"
    
    # Check if SSL is properly configured
    if grep -q "ssl_certificate" "$NGINX_CONFIG"; then
        echo "✅ SSL certificates configured in Nginx"
    else
        echo "❌ SSL certificates not configured in Nginx!"
        echo "   Please check $NGINX_CONFIG"
    fi
    
    # Check if port 443 is listening
    if grep -q "listen 443" "$NGINX_CONFIG"; then
        echo "✅ Port 443 configured"
    else
        echo "❌ Port 443 not configured!"
    fi
else
    echo "❌ Nginx config file not found at $NGINX_CONFIG"
fi
echo ""

# 5. Check if ports are listening
echo "5️⃣  Checking if services are listening..."
if sudo ss -tlnp | grep -q ":443.*nginx"; then
    echo "✅ Nginx is listening on port 443"
else
    echo "❌ Nginx is NOT listening on port 443!"
    echo "   Restarting Nginx..."
    sudo systemctl restart nginx
    sleep 2
    if sudo ss -tlnp | grep -q ":443.*nginx"; then
        echo "✅ Nginx is now listening on port 443"
    else
        echo "❌ Still not listening. Check Nginx logs:"
        echo "   sudo tail -50 /var/log/nginx/error.log"
    fi
fi

if sudo ss -tlnp | grep -q ":3000"; then
    echo "✅ Application is listening on port 3000"
else
    echo "❌ Application is NOT listening on port 3000!"
    echo "   Please check PM2 logs: pm2 logs abcotronics-erp"
fi
echo ""

# 6. Test local connectivity
echo "6️⃣  Testing local connectivity..."
echo "   Testing HTTP (port 80)..."
HTTP_TEST=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1 2>/dev/null || echo "000")
if [ "$HTTP_TEST" != "000" ]; then
    echo "   ✅ HTTP responding: $HTTP_TEST"
else
    echo "   ❌ HTTP not responding"
fi

echo "   Testing HTTPS (port 443) locally..."
HTTPS_TEST=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -k https://127.0.0.1 2>/dev/null || echo "000")
if [ "$HTTPS_TEST" != "000" ]; then
    echo "   ✅ HTTPS responding: $HTTPS_TEST"
else
    echo "   ❌ HTTPS not responding locally"
    echo "   This indicates an Nginx SSL configuration issue"
fi

echo "   Testing application health..."
HEALTH_TEST=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3000/health 2>/dev/null || echo "000")
if [ "$HEALTH_TEST" = "200" ]; then
    echo "   ✅ Application health check: $HEALTH_TEST"
else
    echo "   ❌ Application health check failed: $HEALTH_TEST"
fi
echo ""

# 7. Check recent Nginx errors
echo "7️⃣  Checking recent Nginx errors..."
if [ -f "/var/log/nginx/error.log" ]; then
    ERROR_COUNT=$(sudo tail -100 /var/log/nginx/error.log | wc -l)
    if [ $ERROR_COUNT -gt 0 ]; then
        echo "   Recent errors (last 5):"
        sudo tail -5 /var/log/nginx/error.log | sed 's/^/      /'
    else
        echo "   ✅ No recent errors"
    fi
else
    echo "   ⚠️  Error log not found"
fi
echo ""

# 8. Final verification
echo "8️⃣  Final verification..."
sleep 2

# Test from localhost
echo "   Testing from localhost..."
LOCAL_HTTPS=$(timeout 5 curl -s -o /dev/null -w "%{http_code}" -k https://127.0.0.1 2>/dev/null || echo "000")
if [ "$LOCAL_HTTPS" != "000" ]; then
    echo "   ✅ Local HTTPS working: $LOCAL_HTTPS"
else
    echo "   ❌ Local HTTPS still not working"
    echo ""
    echo "🔍 DIAGNOSTIC: Nginx SSL handshake is failing"
    echo "   This could be due to:"
    echo "   1. SSL certificate issues"
    echo "   2. Nginx SSL configuration problems"
    echo "   3. SSL protocol/cipher mismatches"
    echo ""
    echo "   Next steps:"
    echo "   1. Check Nginx error log: sudo tail -50 /var/log/nginx/error.log"
    echo "   2. Check SSL certificate: sudo openssl x509 -in /etc/letsencrypt/live/abcoafrica.co.za/fullchain.pem -text -noout"
    echo "   3. Test SSL directly: sudo openssl s_client -connect localhost:443 -servername abcoafrica.co.za"
fi

echo ""
echo "✅ Fix script completed!"
echo ""
echo "📋 Summary:"
echo "   - If local HTTPS works but external doesn't, check firewall/DDoS protection"
echo "   - If local HTTPS doesn't work, fix Nginx SSL configuration"
echo "   - Test externally: curl -v https://abcoafrica.co.za"
echo ""




