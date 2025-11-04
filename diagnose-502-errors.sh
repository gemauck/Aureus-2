#!/bin/bash
# Diagnostic script to check 502 Bad Gateway errors
# This checks server status, logs, and connectivity

set -e

echo "🔍 Diagnosing 502 Bad Gateway Errors"
echo "===================================="
echo ""

# Check if this is a server diagnostic or remote check
if [ "$1" == "--remote" ]; then
    SERVER="root@abcoafrica.co.za"
    APP_DIR="/var/www/abcotronics-erp"
    
    echo "📡 Running remote diagnostics on $SERVER..."
    ssh $SERVER << 'ENDSSH'
echo "✅ Connected to server"
echo ""

echo "🔍 STEP 1: Checking PM2 status..."
pm2 status
echo ""

echo "🔍 STEP 2: Checking if app is listening on port 3000..."
netstat -tlnp | grep :3000 || echo "⚠️  No process listening on port 3000"
echo ""

echo "🔍 STEP 3: Checking recent PM2 logs..."
pm2 logs abcotronics-erp --lines 30 --nostream || echo "⚠️  Could not read PM2 logs"
echo ""

echo "🔍 STEP 4: Checking if Node.js is running..."
ps aux | grep node | grep -v grep || echo "⚠️  No Node.js processes found"
echo ""

echo "🔍 STEP 5: Checking environment variables..."
cd /var/www/abcotronics-erp
if [ -f .env ]; then
    echo "✅ .env file exists"
    grep -E "^(PORT|DATABASE_URL|JWT_SECRET|NODE_ENV)=" .env || echo "⚠️  Missing critical environment variables"
else
    echo "❌ .env file not found!"
fi
echo ""

echo "🔍 STEP 6: Testing local connectivity..."
curl -s http://localhost:3000/health || echo "❌ Cannot connect to localhost:3000"
echo ""

echo "🔍 STEP 7: Checking Nginx configuration..."
if [ -f /etc/nginx/sites-available/abcotronics-erp ]; then
    echo "✅ Nginx config found"
    grep -A 10 "location /" /etc/nginx/sites-available/abcotronics-erp | head -20
else
    echo "⚠️  Nginx config not found"
fi
echo ""

echo "🔍 STEP 8: Checking Nginx error logs..."
tail -20 /var/log/nginx/error.log
echo ""

echo "🔍 STEP 9: Checking disk space..."
df -h
echo ""

echo "🔍 STEP 10: Checking recent server logs..."
if [ -f /var/www/abcotronics-erp/logs/pm2-error.log ]; then
    echo "Recent PM2 errors:"
    tail -20 /var/www/abcotronics-erp/logs/pm2-error.log
else
    echo "⚠️  No PM2 error log found"
fi

ENDSSH

else
    # Local diagnostic mode (for development)
    echo "🔍 Running local diagnostics..."
    echo ""
    
    echo "STEP 1: Checking if there's a local server running..."
    curl -s http://localhost:3000/health || echo "⚠️  No local server running"
    echo ""
    
    echo "STEP 2: Checking environment variables..."
    if [ -f .env ]; then
        echo "✅ .env file exists"
        grep -E "^(PORT|DATABASE_URL|JWT_SECRET|NODE_ENV)=" .env || echo "⚠️  Missing variables"
    else
        echo "❌ .env file not found"
    fi
    echo ""
    
    echo "✅ Local diagnostics complete"
    echo ""
    echo "To run remote diagnostics, use:"
    echo "  ./diagnose-502-errors.sh --remote"
fi

echo ""
echo "===================================="
echo "✅ Diagnostics complete"
echo "===================================="
