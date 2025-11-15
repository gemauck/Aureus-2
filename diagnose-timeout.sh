#!/bin/bash
# Diagnostic script for ERR_TIMED_OUT errors on abcoafrica.co.za
# This checks server status, nginx, SSL, and application health

set -e

echo "🔍 Diagnosing ERR_TIMED_OUT Error"
echo "=================================="
echo ""

# Check if we're running locally or on server
if [ -z "$SSH_CONNECTION" ] && [ ! -f "/var/www/abcotronics-erp/server.js" ]; then
    echo "📡 This script can be run:"
    echo ""
    echo "1. On the server directly:"
    echo "   ssh root@abcoafrica.co.za"
    echo "   cd /var/www/abcotronics-erp && bash diagnose-timeout.sh"
    echo ""
    echo "2. Remotely:"
    echo "   ssh root@abcoafrica.co.za 'bash -s' < diagnose-timeout.sh"
    echo ""
    echo "3. From local machine (remote checks):"
    echo "   bash diagnose-timeout.sh --remote"
    echo ""
    
    if [ "$1" != "--remote" ]; then
        echo "Running local DNS checks first..."
        echo ""
        echo "🔍 DNS Resolution:"
        DNS_IP=$(dig abcoafrica.co.za +short | head -1)
        if [ -n "$DNS_IP" ]; then
            echo "✅ DNS resolves to: $DNS_IP"
        else
            echo "❌ DNS resolution failed!"
            exit 1
        fi
        echo ""
        
        echo "🔍 Testing connectivity:"
        if timeout 5 bash -c "echo > /dev/tcp/$DNS_IP/443" 2>/dev/null; then
            echo "✅ Port 443 is open"
        else
            echo "❌ Port 443 is not accessible"
        fi
        
        if timeout 5 bash -c "echo > /dev/tcp/$DNS_IP/80" 2>/dev/null; then
            echo "✅ Port 80 is open"
        else
            echo "❌ Port 80 is not accessible"
        fi
        echo ""
        echo "⚠️  Run on server for detailed diagnostics"
        exit 0
    fi
fi

# Set server connection
if [ "$1" == "--remote" ] && [ -z "$SSH_CONNECTION" ]; then
    SERVER="root@165.22.127.196"
    echo "📡 Connecting to server for diagnostics..."
    ssh $SERVER 'bash -s' << 'ENDSSH'
    SERVER_DIAG=true
ENDSSH
    ssh $SERVER "$(cat <<'ENDSCRIPT'
ENDSCRIPT
    )"
    exit 0
fi

# Server-side diagnostics
APP_DIR="/var/www/abcotronics-erp"
cd "$APP_DIR" 2>/dev/null || {
    APP_DIR="$(pwd)"
    echo "⚠️  Using current directory: $APP_DIR"
}

echo "📂 Working directory: $APP_DIR"
echo ""

# 1. Check Nginx status
echo "1️⃣  Checking Nginx status..."
if systemctl is-active --quiet nginx; then
    echo "✅ Nginx is running"
    systemctl status nginx --no-pager -l | head -5
else
    echo "❌ Nginx is NOT running!"
    echo "   Attempting to start..."
    sudo systemctl start nginx || echo "   ⚠️  Failed to start nginx"
fi
echo ""

# 2. Check Nginx configuration
echo "2️⃣  Checking Nginx configuration..."
if sudo nginx -t 2>&1; then
    echo "✅ Nginx configuration is valid"
else
    echo "❌ Nginx configuration has errors!"
fi
echo ""

# 3. Check SSL certificates
echo "3️⃣  Checking SSL certificates..."
if [ -f "/etc/letsencrypt/live/abcoafrica.co.za/fullchain.pem" ]; then
    echo "✅ SSL certificate exists"
    CERT_EXPIRY=$(sudo openssl x509 -enddate -noout -in /etc/letsencrypt/live/abcoafrica.co.za/fullchain.pem 2>/dev/null | cut -d= -f2)
    echo "   Expires: $CERT_EXPIRY"
else
    echo "❌ SSL certificate NOT found!"
    echo "   Path: /etc/letsencrypt/live/abcoafrica.co.za/fullchain.pem"
fi
echo ""

# 4. Check Nginx is listening on ports
echo "4️⃣  Checking if Nginx is listening on ports 80 and 443..."
NGINX_PORTS=$(sudo ss -tlnp | grep nginx | grep -E ":(80|443) " || echo "")
if [ -n "$NGINX_PORTS" ]; then
    echo "✅ Nginx is listening:"
    echo "$NGINX_PORTS" | sed 's/^/   /'
else
    echo "❌ Nginx is NOT listening on ports 80/443!"
fi
echo ""

# 5. Check PM2 status
echo "5️⃣  Checking PM2 status..."
if command -v pm2 &> /dev/null; then
    PM2_LIST=$(pm2 list)
    if echo "$PM2_LIST" | grep -q "abcotronics-erp"; then
        echo "✅ PM2 app found:"
        echo "$PM2_LIST" | head -5
        PM2_STATUS=$(pm2 jlist | jq -r '.[] | select(.name=="abcotronics-erp") | .pm2_env.status' 2>/dev/null || echo "unknown")
        if [ "$PM2_STATUS" = "online" ]; then
            echo "✅ PM2 app is online"
        else
            echo "❌ PM2 app status: $PM2_STATUS"
        fi
    else
        echo "❌ PM2 app 'abcotronics-erp' not found!"
    fi
else
    echo "⚠️  PM2 not installed"
fi
echo ""

# 6. Check if port 3000 is listening
echo "6️⃣  Checking if application is listening on port 3000..."
PORT_3000=$(sudo ss -tlnp | grep :3000 || sudo netstat -tlnp 2>/dev/null | grep :3000 || echo "")
if [ -n "$PORT_3000" ]; then
    echo "✅ Port 3000 is listening:"
    echo "$PORT_3000" | sed 's/^/   /'
else
    echo "❌ Port 3000 is NOT listening!"
    echo "   The Node.js application is not running"
fi
echo ""

# 7. Test local health endpoint
echo "7️⃣  Testing local health endpoint..."
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3000/health 2>/dev/null || echo "000")
if [ "$HEALTH_RESPONSE" = "200" ]; then
    echo "✅ Health endpoint responding (200 OK)"
    curl -s http://127.0.0.1:3000/health | head -3
elif [ "$HEALTH_RESPONSE" = "000" ]; then
    echo "❌ Health endpoint not responding"
else
    echo "⚠️  Health endpoint returned: $HEALTH_RESPONSE"
fi
echo ""

# 8. Check Nginx error logs
echo "8️⃣  Recent Nginx error logs..."
if [ -f "/var/log/nginx/error.log" ]; then
    echo "Last 10 errors:"
    sudo tail -10 /var/log/nginx/error.log 2>/dev/null | sed 's/^/   /' || echo "   (cannot read)"
else
    echo "   (nginx error log not found)"
fi
echo ""

# 9. Check Nginx access logs for recent activity
echo "9️⃣  Recent Nginx access (showing timeouts/errors)..."
if [ -f "/var/log/nginx/access.log" ]; then
    echo "Last 5 requests (timeouts/errors):"
    sudo tail -100 /var/log/nginx/access.log 2>/dev/null | grep -E "(timeout|499|502|503|504)" | tail -5 | sed 's/^/   /' || echo "   (no recent timeout/error entries)"
else
    echo "   (nginx access log not found)"
fi
echo ""

# 10. Check disk space and system resources
echo "🔟 Checking system resources..."
echo "Disk space:"
df -h / | tail -1
echo ""
echo "Memory:"
free -h | head -2
echo ""
echo "Load average:"
uptime
echo ""

# 11. Check firewall status
echo "1️⃣1️⃣  Checking firewall status..."
if command -v ufw &> /dev/null; then
    UFW_STATUS=$(sudo ufw status 2>/dev/null || echo "not active")
    echo "$UFW_STATUS" | head -5
elif command -v firewalld &> /dev/null; then
    echo "Firewalld status:"
    sudo firewall-cmd --state 2>/dev/null || echo "   (cannot check)"
else
    echo "   (no common firewall tool found)"
fi
echo ""

# 12. Test Nginx directly
echo "1️⃣2️⃣  Testing Nginx response..."
echo "HTTP (port 80):"
HTTP_TEST=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1 2>/dev/null || echo "000")
echo "   Response code: $HTTP_TEST"
echo ""
echo "HTTPS (port 443) local:"
HTTPS_TEST=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -k https://127.0.0.1 2>/dev/null || echo "000")
echo "   Response code: $HTTPS_TEST"
echo ""

# Summary and recommendations
echo "📋 SUMMARY AND RECOMMENDATIONS"
echo "=============================="
echo ""

ISSUES=0

if ! systemctl is-active --quiet nginx; then
    echo "❌ ISSUE: Nginx is not running"
    echo "   FIX: sudo systemctl start nginx"
    ISSUES=$((ISSUES + 1))
fi

if [ -z "$PORT_3000" ]; then
    echo "❌ ISSUE: Application not running on port 3000"
    echo "   FIX: cd $APP_DIR && pm2 start server.js --name abcotronics-erp"
    ISSUES=$((ISSUES + 1))
fi

if [ "$HEALTH_RESPONSE" != "200" ]; then
    echo "❌ ISSUE: Health endpoint not responding"
    echo "   FIX: Check PM2 logs: pm2 logs abcotronics-erp --lines 50"
    ISSUES=$((ISSUES + 1))
fi

if [ ! -f "/etc/letsencrypt/live/abcoafrica.co.za/fullchain.pem" ]; then
    echo "⚠️  WARNING: SSL certificate not found"
    echo "   FIX: sudo certbot certonly --standalone -d abcoafrica.co.za -d www.abcoafrica.co.za"
    ISSUES=$((ISSUES + 1))
fi

if [ $ISSUES -eq 0 ]; then
    echo "✅ All checks passed!"
    echo ""
    echo "If you're still getting timeouts, try:"
    echo "  1. sudo systemctl restart nginx"
    echo "  2. pm2 restart abcotronics-erp"
    echo "  3. Check external firewall/network issues"
else
    echo ""
    echo "🔧 Quick fix commands:"
    echo "  sudo systemctl restart nginx"
    echo "  pm2 restart abcotronics-erp"
    echo "  pm2 logs abcotronics-erp --lines 50"
fi

echo ""



