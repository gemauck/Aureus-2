#!/bin/bash
# Apply Lead Status Migration via Prisma

DROPLET_IP="165.22.127.196"

echo "🔧 Applying Lead Status Migration via Prisma..."

ssh root@$DROPLET_IP << 'ENDSSH'
cd /var/www/abcotronics-erp

echo "📝 Applying migration SQL via Prisma..."

# Create a temporary SQL file
cat > /tmp/lead_status_migration.sql << 'SQL'
-- Change the default value for the status column
ALTER TABLE "Client" ALTER COLUMN "status" SET DEFAULT 'Potential';

-- Update existing leads with "active" status to "Potential" 
UPDATE "Client" 
SET "status" = 'Potential' 
WHERE "type" = 'lead' 
  AND ("status" = 'active' OR "status" IS NULL OR "status" = '');
SQL

# Apply using Prisma
npx prisma db execute --file /tmp/lead_status_migration.sql --schema prisma/schema.prisma

# Clean up
rm /tmp/lead_status_migration.sql

echo "✅ Migration applied!"
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp

ENDSSH

echo "✅ Migration complete!"

