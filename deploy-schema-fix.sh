#!/bin/bash
# Deploy schema fix to production server
set -e

echo "🔧 Deploying Schema Fix to Production"
echo "======================================"
echo ""

# Push schema fix SQL to server and execute it
ssh root@abcoafrica.co.za << 'ENDSSH'
set -e

cd /var/www/abcotronics-erp
echo "✅ Connected to server"
echo ""

echo "STEP 1: Checking PostgreSQL connection..."
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d '=' -f2- | tr -d '"')
echo "Database: $(echo $DATABASE_URL | cut -d'@' -f2 | cut -d'/' -f1)"
echo ""

echo "STEP 2: Adding missing accessibleProjectIds column..."
psql "$DATABASE_URL" << PSQL_SCRIPT
-- Add missing accessibleProjectIds column to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accessibleProjectIds" TEXT NOT NULL DEFAULT '[]';
SELECT 'Column accessibleProjectIds added successfully' AS status;
PSQL_SCRIPT
echo ""

echo "STEP 3: Verifying column was added..."
psql "$DATABASE_URL" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'accessibleProjectIds';"
echo ""

echo "STEP 4: Regenerating Prisma client..."
npx prisma generate --schema=./prisma/schema.prisma
echo ""

echo "STEP 5: Restarting application..."
pm2 restart abcotronics-erp
sleep 3
pm2 status
echo ""

echo "STEP 6: Testing health endpoint..."
curl -s http://localhost:3000/health || echo "⚠️ Health check failed"
echo ""

echo "STEP 7: Checking for errors in logs..."
pm2 logs abcotronics-erp --lines 20 --nostream | grep -i "error\|accessibleProjectIds" | tail -10 || echo "No errors found"
echo ""

echo "✅ Schema fix deployment complete"
echo ""
echo "📋 Next steps:"
echo "  1. Test the application: https://abcoafrica.co.za"
echo "  2. Monitor logs: pm2 logs abcotronics-erp"
echo "  3. Verify no more accessibleProjectIds errors"

ENDSSH

echo ""
echo "=============================================="
echo "✅ Deployment complete"
echo "=============================================="

