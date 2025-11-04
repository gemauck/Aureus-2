#!/bin/bash
# Deploy schema fix using Prisma
set -e

echo "🔧 Deploying Schema Fix using Prisma"
echo "====================================="
echo ""

ssh root@abcoafrica.co.za << 'ENDSSH'
set -e

cd /var/www/abcotronics-erp
echo "✅ Connected to server"
echo ""

echo "STEP 1: Loading environment variables..."
# Source the .env file properly
set -a
source .env
set +a
echo "Database connected to: $(echo $DATABASE_URL | cut -d'@' -f2 | cut -d'/' -f1)"
echo ""

echo "STEP 2: Creating SQL migration file..."
cat > /tmp/add_accessible_project_ids.sql << 'SQL'
-- Add missing accessibleProjectIds column to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accessibleProjectIds" TEXT NOT NULL DEFAULT '[]';
SQL
echo "✅ Migration SQL created"
echo ""

echo "STEP 3: Executing SQL migration using node..."
node << 'NODE_SCRIPT'
import('dotenv/config').then(() => {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  
  async function runMigration() {
    try {
      const fs = require('fs');
      const { PrismaClient } = require('@prisma/client');
      
      // Read migration SQL
      const sql = fs.readFileSync('/tmp/add_accessible_project_ids.sql', 'utf8');
      
      // Execute migration
      const prisma = new PrismaClient();
      await prisma.$executeRawUnsafe(sql);
      
      console.log('✅ Column added successfully');
      
      // Verify column exists
      const result = await prisma.$queryRawUnsafe(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'User' 
        AND column_name = 'accessibleProjectIds'
      `);
      
      console.log('✅ Verification:', result);
      
      await prisma.$disconnect();
    } catch (error) {
      console.error('❌ Migration error:', error.message);
      process.exit(1);
    }
  }
  
  runMigration();
}).catch(error => {
  console.error('❌ Import error:', error.message);
  process.exit(1);
});
NODE_SCRIPT
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

echo "STEP 7: Checking for errors..."
sleep 2
pm2 logs abcotronics-erp --lines 30 --nostream | grep -i "error\|accessibleProjectIds\|User" | tail -20 || echo "No errors found"
echo ""

echo "✅ Schema fix deployment complete"
echo ""
echo "📋 Monitoring logs for 10 seconds..."
sleep 10
pm2 logs abcotronics-erp --lines 20 --nostream | tail -30

ENDSSH

echo ""
echo "=============================================="
echo "✅ Deployment complete"
echo "=============================================="

