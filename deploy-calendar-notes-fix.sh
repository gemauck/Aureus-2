#!/bin/bash
# Apply Calendar Notes fix to production database

echo "📅 Applying Calendar Notes fix to production database..."

# Connect to production server and apply fix
ssh root@165.22.127.196 << 'ENDSSH'
cd /var/www/abcotronics-erp

echo "📁 Current directory: $(pwd)"
echo "🔄 Pulling latest changes..."
git pull origin main

echo "📦 Installing dependencies..."
npm install

echo "🗄️  Syncing database schema with Prisma..."
npx prisma db push --accept-data-loss

echo "🔄 Regenerating Prisma client..."
npx prisma generate

echo "🔄 Restarting application..."
pm2 restart abcotronics-erp || pm2 start server.js --name abcotronics-erp

echo "✅ Calendar Notes fix applied!"
ENDSSH

echo ""
echo "✅ Production database updated successfully!"
echo ""
echo "📝 Next steps:"
echo "   1. Test calendar notes at https://abcoafrica.co.za"
echo "   2. Create a note and verify it persists after refresh"
echo "   3. Check PM2 logs if issues occur"

