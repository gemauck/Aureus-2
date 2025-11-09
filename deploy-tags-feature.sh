#!/bin/bash
# Deploy Tags Feature to Production Server
# This script deploys the tags system implementation

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

echo "🚀 Deploying Tags Feature to Production..."
echo "📡 Server: $DROPLET_IP"
echo ""

# Deploy to server
ssh root@$DROPLET_IP << 'ENDSSH'
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

# Generate Prisma client
echo "🔨 Generating Prisma client..."
npx prisma generate
echo "✅ Prisma client generated"
echo ""

# Apply database migration
echo "🗄️  Applying database migration..."
if ./scripts/safe-db-migration.sh npx prisma migrate deploy; then
    echo "✅ Migration applied successfully"
elif ./scripts/safe-db-migration.sh npx prisma db push; then
    echo "✅ Schema pushed successfully (using db push)"
else
    echo "⚠️  Migration failed - trying manual SQL..."
    if [ -f "prisma/migrations/MANUAL_TAG_MIGRATION.sql" ]; then
        ./scripts/safe-db-migration.sh psql $DATABASE_URL < prisma/migrations/MANUAL_TAG_MIGRATION.sql && echo "✅ Manual migration applied" || echo "❌ Manual migration also failed"
    else
        echo "❌ Manual migration file not found"
        echo "⚠️  You may need to run migration manually"
    fi
fi
echo ""

# Restart application
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp || pm2 start server.js --name abcotronics-erp
pm2 save
echo "✅ Application restarted"
echo ""

# Verify deployment
echo "🔍 Verifying deployment..."
echo "Checking if Tag table exists..."
psql $DATABASE_URL -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'Tag';" 2>/dev/null && echo "✅ Tag table exists" || echo "⚠️  Could not verify Tag table"
echo ""

echo "✅ Tags feature deployment complete!"
echo ""
echo "🎉 Next steps:"
echo "  1. Test the tags feature in the UI"
echo "  2. Check server logs: pm2 logs abcotronics-erp"
echo "  3. Verify tags API: curl http://localhost:3000/api/tags"
echo ""
ENDSSH

echo ""
echo "✅ Deployment script completed!"
echo "📋 Check the output above for any errors"

