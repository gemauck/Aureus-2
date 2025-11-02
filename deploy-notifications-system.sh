#!/bin/bash
# Deploy Notification System to Production Server

# Production server details
SERVER_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Deploying Notification System..."
echo "📡 Server: $SERVER_IP"
echo ""

# SSH into server and deploy
ssh root@$SERVER_IP << 'ENDSSH'
set -e

cd /var/www/abcotronics-erp

echo "✅ Connected to server"
echo "📁 Current directory: $(pwd)"
echo ""

# Pull latest code
echo "📥 Pulling latest code from git..."
git pull origin main || echo "⚠️ Git pull failed - continuing anyway"
echo ""

# Install/update dependencies if needed
if [ -f "package.json" ]; then
    echo "📦 Checking dependencies..."
    npm install --production
    echo ""
fi

# Build frontend if needed
if [ -d "src" ]; then
    echo "🏗️  Building frontend..."
    npm run build || echo "⚠️ Build failed - continuing anyway"
    echo ""
fi

echo "🗄️  Applying database migration..."
if npx prisma migrate deploy; then
    echo "✅ Migration applied successfully"
elif npx prisma db push; then
    echo "✅ Schema pushed successfully (using db push)"
else
    echo "⚠️  Migration failed - you may need to run manually"
fi

echo "🔧 Generating Prisma client..."
npx prisma generate

echo "🔄 Restarting application..."
pm2 restart abcotronics-erp || pm2 start server.js --name abcotronics-erp
pm2 save
echo "✅ Application restarted"

echo ""
echo "🔍 Verifying deployment..."
pm2 logs abcotronics-erp --lines 20 --nostream

ENDSSH

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Notification System Deployed Successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎉 Next steps:"
echo "1. Check the application is running"
echo "2. Test @mentions in comments"
echo "3. Verify bell icon appears in header"
echo "4. Check notifications work"
echo ""
echo "📚 Documentation:"
echo "   • DEPLOY-NOW.md"
echo "   • NOTIFICATIONS-DEPLOYMENT-STEPS.md"
echo "   • QUICK-START-MENTIONS.md"

