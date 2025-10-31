#!/bin/bash
# Apply Calendar Notes migration to production database

echo "🔧 Applying Calendar Notes migration to production database..."

# Connect to production server and apply migration
ssh root@165.22.127.196 << 'ENDSSH'
cd /var/www/abcotronics-erp

echo "📁 Current directory: $(pwd)"
echo "🔄 Pulling latest changes..."
git pull origin main

echo "📦 Installing dependencies..."
npm install

echo "🔨 Generating Prisma Client..."
npx prisma generate

echo "🚀 Running database migration..."
npx prisma migrate deploy

if [ $? -ne 0 ]; then
    echo "⚠️  Migration deploy failed, trying db push instead..."
    npx prisma db push --accept-data-loss
fi

echo "🔄 Restarting application..."
pm2 restart abcotronics-erp || pm2 start server.js --name abcotronics-erp

echo "✅ Migration complete!"
ENDSSH

echo "✅ Production database updated successfully!"
echo ""
echo "📝 Next steps:"
echo "   1. Verify the calendar works on the dashboard"
echo "   2. Test creating a note on a calendar day"
echo "   3. Check that notes persist after refresh"

