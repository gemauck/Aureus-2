#!/bin/bash
# Update Weekly FMS Review schema on production server

set -e

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "🔄 Updating Weekly FMS Review schema on production..."
echo "Server: $SERVER"
echo ""

ssh $SERVER << 'ENDSSH'
set -e

cd /var/www/abcotronics-erp

echo "📦 Generating Prisma client..."
npx prisma generate

echo ""
echo "🗄️  Pushing database schema changes..."
npx prisma db push --skip-generate

echo ""
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp || pm2 restart all

echo ""
echo "✅ Schema update complete!"
echo ""
echo "🧪 Test at: https://abcoafrica.co.za"
ENDSSH

echo ""
echo "✅ Production schema updated!"
echo ""
echo "🌐 Test at: https://abcoafrica.co.za"

