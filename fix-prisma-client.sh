#!/bin/bash
# Fix Prisma client generation on server

set -e

echo "🔧 Regenerating Prisma client on server..."
echo ""

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

ssh $SERVER << 'FIX'
set -e

cd /var/www/abcotronics-erp

echo "📦 Regenerating Prisma client..."
npx prisma generate

echo ""
echo "✅ Prisma client regenerated"
echo ""
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp

echo ""
echo "✅ Application restarted"
echo ""
echo "📊 Application status:"
pm2 status
FIX

echo ""
echo "✅ Prisma client fix complete!"

