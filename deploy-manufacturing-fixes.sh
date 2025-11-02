#!/bin/bash
# Deploy Manufacturing API fixes to production

set -e

echo "🚀 Deploying Manufacturing API fixes to production..."
echo ""

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "📤 Deploying to server: $SERVER"
echo ""

# Deploy on server
ssh $SERVER << 'DEPLOY'
set -e

cd /var/www/abcotronics-erp

echo "📥 Pulling latest code from GitHub..."
git pull origin main || {
    echo "⚠️ Git pull failed, checking status..."
    git status
    exit 1
}

echo "✅ Code updated"
echo ""

echo "🔍 Verifying manufacturing.js was updated..."
if [ -f "api/manufacturing.js" ]; then
    echo "✅ manufacturing.js present"
    # Check if the fix is in the file
    if grep -q "Update production order status to completed" api/manufacturing.js; then
        echo "✅ Manufacturing fix verified in file"
    else
        echo "⚠️ Warning: Fix might not be in file"
    fi
else
    echo "❌ api/manufacturing.js missing!"
    exit 1
fi

echo ""
echo "🔄 Running database migrations (if needed)..."
echo "⚠️  Note: BOM table migration might be needed"

# Run Prisma migrations
npx prisma migrate deploy || {
    echo "⚠️ Migration failed or no new migrations"
    echo "💡 If BOM table error persists, check migration status"
}

echo ""
echo "🏗️ Generating Prisma client..."
npx prisma generate

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
echo "📝 Showing recent logs (last 20 lines)..."
pm2 logs abcotronics-erp --lines 20 --nostream

echo ""
echo "✅ Deployment complete!"
DEPLOY

echo ""
echo "✅ Manufacturing API fixes deployed successfully!"
echo ""
echo "🔍 Next steps:"
echo "1. Test manufacturing operations at: https://abcoafrica.co.za"
echo "2. Try updating a work order and verify no 500 errors"
echo "3. If BOM table error appears, run on server:"
echo "   ssh $SERVER 'cd /var/www/abcotronics-erp && npx prisma migrate deploy'"
echo ""
echo "📝 Check logs: ssh $SERVER 'pm2 logs abcotronics-erp --lines 50'"
echo ""

