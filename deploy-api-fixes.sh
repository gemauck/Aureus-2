#!/bin/bash
# Deploy API authentication and error handling fixes

set -e

echo "🚀 Deploying API authentication and error handling fixes..."
echo ""

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

# Deploy on server
echo "🔧 Deploying fixes to server..."
ssh $SERVER << 'DEPLOY'
set -e

cd /var/www/abcotronics-erp

echo "📥 Pulling latest code..."
git pull origin main || {
    echo "⚠️ Git pull failed, checking status..."
    git status
    exit 1
}

echo "✅ Code updated"
echo ""

echo "🔍 Verifying files were updated..."
if [ -f "api/_lib/authRequired.js" ] && [ -f "api/users.js" ] && [ -f "api/me.js" ]; then
    echo "✅ API fix files present"
else
    echo "❌ API fix files missing!"
    exit 1
fi

echo ""
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp || {
    echo "⚠️ PM2 restart failed, trying to start..."
    pm2 start server.js --name abcotronics-erp || {
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
echo "📝 Showing recent logs..."
pm2 logs abcotronics-erp --lines 10 --nostream
DEPLOY

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🔍 Next steps:"
echo "1. Check server logs: ssh $SERVER 'pm2 logs abcotronics-erp --lines 50'"
echo "2. Test API endpoints:"
echo "   - https://abcoafrica.co.za/api/health"
echo "   - https://abcoafrica.co.za/api/me (requires auth)"
echo "   - https://abcoafrica.co.za/api/users (requires admin auth)"
echo ""
echo "💡 If you see 500 errors, check the server logs for detailed error messages"

