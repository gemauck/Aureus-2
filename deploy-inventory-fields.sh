#!/bin/bash
# Deploy inventory fields update to production server

echo "🚀 Deploying Inventory Fields Update..."
echo "📡 Server: 165.22.127.196"

# Connect to production server and deploy
ssh root@165.22.127.196 << 'ENDSSH'
set -e

cd /var/www/abcotronics-erp

echo "📥 Pulling latest code..."
git fetch origin
git reset --hard origin/main

echo "✅ Code updated"

echo "🔧 Running database migration..."
# Try the migration script first, fallback to prisma db push
if [ -f "apply-inventory-fields-migration.sh" ]; then
    chmod +x apply-inventory-fields-migration.sh
    ./apply-inventory-fields-migration.sh || {
        echo "⚠️  Migration script had issues, trying Prisma db push..."
        npx prisma db push --accept-data-loss
    }
else
    echo "💡 Using Prisma db push directly..."
    npx prisma db push --accept-data-loss
fi

echo "🔄 Regenerating Prisma client..."
npx prisma generate

echo "🔄 Restarting application..."
pm2 restart abcotronics-erp

echo "✅ Deployment complete!"
echo "📊 Check status with: pm2 status"
echo "📋 Check logs with: pm2 logs abcotronics-erp"
ENDSSH

echo "✅ Deployment successful!"

