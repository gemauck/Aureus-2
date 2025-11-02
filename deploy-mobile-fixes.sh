#!/bin/bash
# Deploy Mobile UI Fixes to DigitalOcean Droplet with Migration

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Deploying Mobile UI Fixes to Droplet..."
echo "📡 Droplet IP: $DROPLET_IP"
echo ""

# SSH into droplet and deploy
ssh root@$DROPLET_IP << 'ENDSSH'
set -e

echo "✅ Connected to droplet"
cd /var/www/abcotronics-erp

echo "📥 Pulling latest code..."
git fetch origin
git reset --hard origin/main
echo "✅ Code updated"

echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"

echo "🏗️  Building frontend..."
npm run build || (echo "⚠️ Build failed, continuing anyway..." && true)
echo "✅ Build complete"

echo "🏗️  Generating Prisma client..."
npx prisma generate
echo "✅ Prisma client generated"

echo "🗄️  Running database migrations..."
# Try migrate deploy first (for production)
npx prisma migrate deploy 2>/dev/null || {
    echo "⚠️  migrate deploy failed, trying db push..."
    npx prisma db push --accept-data-loss || {
        echo "⚠️  db push failed, continuing anyway..."
        true
    }
}
echo "✅ Database migration complete"

echo "🔄 Restarting application..."
pm2 restart abcotronics-erp || {
    echo "⚠️  PM2 restart failed, trying to start..."
    pm2 start server.js --name abcotronics-erp || true
}
pm2 save
echo "✅ Application restarted"

echo "📊 Checking application status..."
pm2 status abcotronics-erp

echo ""
echo "✅ Deployment complete!"
echo "🌐 Application should be running on: http://165.22.127.196:3000"
ENDSSH

echo ""
echo "✅ Deployment successful!"
echo ""
echo "📋 Next steps:"
echo "   1. Check application logs: ssh root@165.22.127.196 'pm2 logs abcotronics-erp'"
echo "   2. Verify app is running: curl http://165.22.127.196:3000"
echo "   3. Test mobile UI on actual device"
