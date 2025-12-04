#!/bin/bash
# Quick deploy for leads API syntax fix

set -e

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"
LOCAL_DIR="$(pwd)"

echo "🚀 Deploying Leads API Fix..."
echo "📡 Server: $SERVER"
echo "📁 Local: $LOCAL_DIR"
echo ""

# Step 1: Verify files exist locally
echo "🔍 Verifying fixed files..."
if [ ! -f "api/leads.js" ]; then
    echo "❌ api/leads.js not found!"
    exit 1
fi
if [ ! -f "server.js" ]; then
    echo "❌ server.js not found!"
    exit 1
fi
echo "✅ Files verified"
echo ""

# Step 2: Deploy via rsync (only the fixed files)
echo "📤 Copying fixed files to server..."
rsync -avz --progress \
  api/leads.js \
  server.js \
  "$SERVER:$APP_DIR/"

echo "✅ Files copied"
echo ""

# Step 3: Restart server
echo "🔄 Restarting application..."
ssh $SERVER << 'DEPLOY'
set -e

cd /var/www/abcotronics-erp

echo "🔍 Verifying files were updated..."
if [ -f "api/leads.js" ] && [ -f "server.js" ]; then
    echo "✅ Files present on server"
else
    echo "❌ Files missing on server!"
    exit 1
fi

echo ""
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp --update-env || {
    echo "⚠️ PM2 restart failed, trying to start..."
    pm2 start server.js --name abcotronics-erp --update-env || {
        echo "❌ Failed to start application"
        exit 1
    }
}

echo ""
echo "✅ Application restarted"
echo ""
echo "📊 Checking application status..."
pm2 status

echo ""
echo "📝 Showing recent logs (last 20 lines)..."
pm2 logs abcotronics-erp --lines 20 --nostream || true
DEPLOY

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🔍 Next steps:"
echo "1. Check server logs: ssh $SERVER 'pm2 logs abcotronics-erp --lines 50'"
echo "2. Test the API: https://abcoafrica.co.za/api/leads"
echo "3. Monitor for errors in browser console"
echo ""

