#!/bin/bash
# Add permissions column to User table if missing

set -e

echo "🔧 Adding permissions column to User table..."
echo ""

SERVER="root@abcoafrica.co.za"

ssh $SERVER << 'MIGRATE'
set -e

cd /var/www/abcotronics-erp

echo "📝 Checking if permissions column exists..."
npx prisma db execute --stdin << 'SQL'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'User' 
        AND column_name = 'permissions'
    ) THEN
        ALTER TABLE "User" ADD COLUMN "permissions" TEXT DEFAULT '[]';
        RAISE NOTICE 'Added permissions column to User table';
    ELSE
        RAISE NOTICE 'Permissions column already exists';
    END IF;
END $$;
SQL

echo ""
echo "✅ Permissions column check complete"
echo ""
echo "🔄 Regenerating Prisma client..."
npx prisma generate

echo ""
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp

echo ""
echo "✅ Complete!"
MIGRATE

echo ""
echo "✅ Migration complete!"

