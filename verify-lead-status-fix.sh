#!/bin/bash
# Verify Lead Status Fix on Droplet

DROPLET_IP="165.22.127.196"

echo "🔍 Verifying Lead Status Fix on Droplet..."

ssh root@$DROPLET_IP << 'ENDSSH'
cd /var/www/abcotronics-erp

echo "📊 Checking database schema..."
npx prisma db execute --stdin << 'SQL'
-- Check default value for status column
SELECT column_name, column_default 
FROM information_schema.columns 
WHERE table_name = 'Client' AND column_name = 'status';
SQL

echo ""
echo "📊 Checking existing lead statuses..."
npx prisma db execute --stdin << 'SQL'
SELECT status, COUNT(*) as count 
FROM "Client" 
WHERE "type" = 'lead' 
GROUP BY status;
SQL

echo ""
echo "✅ Verification complete!"
ENDSSH

echo "✅ Verification complete!"

