#!/bin/bash
# Fix database schema issues on production server
set -e

echo "🔧 Fixing Database Schema on Production Server"
echo "=============================================="
echo ""

ssh root@abcoafrica.co.za << 'ENDSSH'
set -e

cd /var/www/abcotronics-erp
echo "✅ Connected to server"
echo ""

echo "STEP 1: Checking current database schema..."
npx prisma db pull --print || echo "⚠️  Could not pull schema"
echo ""

echo "STEP 2: Generating Prisma client with latest schema..."
npx prisma generate
echo ""

echo "STEP 3: Pushing schema changes to database..."
npx prisma db push --accept-data-loss --skip-generate
echo ""

echo "STEP 4: Verifying database connection..."
node -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
await prisma.\$connect();
console.log('✅ Database connection successful');
const count = await prisma.user.count();
console.log(\`📊 Users in database: \${count}\`);
await prisma.\$disconnect();
"
echo ""

echo "STEP 5: Restarting application..."
pm2 restart abcotronics-erp
sleep 5
pm2 status
echo ""

echo "STEP 6: Testing API endpoints..."
echo "Testing /health endpoint..."
curl -s http://localhost:3000/health | head -20 || echo "❌ Health check failed"
echo ""

echo "STEP 7: Checking PM2 logs for errors..."
pm2 logs abcotronics-erp --lines 20 --nostream | tail -30
echo ""

echo "✅ Schema fix complete"
echo ""
echo "📋 Next steps:"
echo "  1. Monitor PM2 logs: pm2 logs abcotronics-erp"
echo "  2. Test the application: https://abcoafrica.co.za"
echo "  3. Check for any remaining errors"

ENDSSH

echo ""
echo "=============================================="
echo "✅ Deployment complete"
echo "=============================================="

