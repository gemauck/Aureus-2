#!/bin/bash
# Immediate fix for 502 Bad Gateway errors
# This script checks server status and restarts if needed

set -e

echo "🔍 Diagnosing 502 Bad Gateway Error..."
echo ""

# Check if we're on the server or local
if [ -z "$SSH_CONNECTION" ] && [ ! -f "/var/www/abcotronics-erp/server.js" ]; then
    echo "📡 This script should be run on the server via SSH:"
    echo "   ssh root@abcoafrica.co.za 'bash -s' < fix-502-immediate.sh"
    echo ""
    echo "Or run directly on server:"
    echo "   cd /var/www/abcotronics-erp && ./fix-502-immediate.sh"
    echo ""
    exit 1
fi

# Set app directory
APP_DIR="/var/www/abcotronics-erp"
cd "$APP_DIR" 2>/dev/null || {
    # If not in /var/www, try current directory
    APP_DIR="$(pwd)"
    echo "⚠️  Using current directory: $APP_DIR"
}

echo "📂 Working directory: $APP_DIR"
echo ""

# 1. Check if Node.js process is running
echo "1️⃣  Checking Node.js process..."
NODE_PROCESS=$(ps aux | grep -E "[n]ode.*server.js|[n]ode.*3000" | head -1)
if [ -z "$NODE_PROCESS" ]; then
    echo "❌ Node.js server is NOT running!"
    NEEDS_RESTART=true
else
    echo "✅ Node.js process found:"
    echo "   $NODE_PROCESS"
    NEEDS_RESTART=false
fi
echo ""

# 2. Check PM2 status
echo "2️⃣  Checking PM2 status..."
if command -v pm2 &> /dev/null; then
    PM2_STATUS=$(pm2 list | grep -E "abcotronics|erp" || echo "")
    if [ -z "$PM2_STATUS" ]; then
        echo "❌ PM2 app not found or not running!"
        NEEDS_RESTART=true
    else
        echo "✅ PM2 status:"
        pm2 list | head -5
    fi
else
    echo "⚠️  PM2 not found (may not be installed)"
fi
echo ""

# 3. Check if port 3000 is listening
echo "3️⃣  Checking port 3000..."
if command -v netstat &> /dev/null; then
    PORT_CHECK=$(sudo netstat -tlnp 2>/dev/null | grep :3000 || sudo ss -tlnp 2>/dev/null | grep :3000 || echo "")
elif command -v ss &> /dev/null; then
    PORT_CHECK=$(sudo ss -tlnp 2>/dev/null | grep :3000 || echo "")
else
    PORT_CHECK=""
fi

if [ -z "$PORT_CHECK" ]; then
    echo "❌ Port 3000 is NOT listening!"
    NEEDS_RESTART=true
else
    echo "✅ Port 3000 is listening:"
    echo "   $PORT_CHECK"
fi
echo ""

# 4. Test health endpoint
echo "4️⃣  Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3000/health 2>/dev/null || echo "000")
if [ "$HEALTH_RESPONSE" = "200" ]; then
    echo "✅ Health endpoint responding (200 OK)"
    curl -s http://127.0.0.1:3000/health | head -3
elif [ "$HEALTH_RESPONSE" = "000" ]; then
    echo "❌ Health endpoint not responding (connection failed)"
    NEEDS_RESTART=true
else
    echo "⚠️  Health endpoint returned: $HEALTH_RESPONSE"
    NEEDS_RESTART=true
fi
echo ""

# 5. Check nginx error logs
echo "5️⃣  Recent nginx errors..."
if [ -f "/var/log/nginx/error.log" ]; then
    echo "Last 5 nginx errors:"
    sudo tail -5 /var/log/nginx/error.log 2>/dev/null | head -5 || echo "   (cannot read nginx logs)"
else
    echo "   (nginx error log not found)"
fi
echo ""

# 6. Check server.js exists
echo "6️⃣  Checking server files..."
if [ -f "$APP_DIR/server.js" ]; then
    echo "✅ server.js exists"
else
    echo "❌ server.js NOT found at $APP_DIR/server.js"
    echo "   Please verify deployment directory"
    exit 1
fi
echo ""

# 7. Restart if needed
if [ "$NEEDS_RESTART" = true ]; then
    echo "🔧 Restarting server..."
    echo ""
    
    # Try PM2 first
    if command -v pm2 &> /dev/null; then
        echo "📦 Using PM2 to restart..."
        
        # Delete existing PM2 process if any
        pm2 delete abcotronics-erp 2>/dev/null || true
        pm2 delete erp 2>/dev/null || true
        pm2 delete server 2>/dev/null || true
        
        # Start with PM2
        cd "$APP_DIR"
        pm2 start server.js --name abcotronics-erp --update-env || {
            echo "⚠️  PM2 start failed, trying with environment..."
            NODE_ENV=production pm2 start server.js --name abcotronics-erp
        }
        
        pm2 save
        sleep 2
        
        # Check if it started
        if pm2 list | grep -q "abcotronics-erp.*online"; then
            echo "✅ Server restarted successfully with PM2!"
        else
            echo "❌ PM2 restart failed, checking logs..."
            pm2 logs abcotronics-erp --lines 10 --nostream
            exit 1
        fi
    else
        echo "⚠️  PM2 not available, trying direct restart..."
        
        # Kill existing node processes on port 3000
        sudo lsof -ti:3000 | xargs sudo kill -9 2>/dev/null || true
        sleep 1
        
        # Start server directly (background)
        cd "$APP_DIR"
        nohup node server.js > /tmp/erp-server.log 2>&1 &
        sleep 3
        
        # Check if it's running
        if curl -s http://127.0.0.1:3000/health > /dev/null 2>&1; then
            echo "✅ Server restarted successfully!"
        else
            echo "❌ Direct start failed. Check logs:"
            tail -20 /tmp/erp-server.log
            exit 1
        fi
    fi
else
    echo "✅ Server appears to be running correctly"
    echo "   The 502 error might be an nginx configuration issue"
fi
echo ""

# 8. Final verification
echo "8️⃣  Final verification..."
sleep 2
FINAL_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3000/health 2>/dev/null || echo "000")
if [ "$FINAL_HEALTH" = "200" ]; then
    echo "✅ ✅ ✅ Server is responding correctly!"
    echo ""
    echo "📋 Test the site:"
    echo "   curl -I https://abcoafrica.co.za/health"
    echo ""
    echo "If still getting 502, check nginx configuration:"
    echo "   sudo nginx -t"
    echo "   sudo systemctl restart nginx"
else
    echo "❌ Server still not responding"
    echo "   Check logs for errors:"
    if command -v pm2 &> /dev/null; then
        echo "   pm2 logs abcotronics-erp --lines 50"
    else
        echo "   tail -50 /tmp/erp-server.log"
    fi
    exit 1
fi

echo ""
echo "✅ Diagnostic and fix complete!"

