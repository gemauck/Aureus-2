#!/bin/bash
# Apply Lead Status Migration SQL directly

DROPLET_IP="165.22.127.196"

echo "🔧 Applying Lead Status Migration SQL..."

ssh root@$DROPLET_IP << 'ENDSSH'
cd /var/www/abcotronics-erp

# Load DATABASE_URL from .env
export $(cat .env | grep -v '^#' | xargs)

echo "📝 Applying migration SQL..."

# Apply the migration using psql directly
psql "$DATABASE_URL" << 'SQL'
-- Change the default value for the status column
ALTER TABLE "Client" ALTER COLUMN "status" SET DEFAULT 'Potential';

-- Update existing leads with "active" status to "Potential" 
UPDATE "Client" 
SET "status" = 'Potential' 
WHERE "type" = 'lead' 
  AND ("status" = 'active' OR "status" IS NULL OR "status" = '');

-- Verify the changes
SELECT 'Default value updated' as status;
SELECT status, COUNT(*) as count 
FROM "Client" 
WHERE "type" = 'lead' 
GROUP BY status;
SQL

echo "✅ Migration applied!"
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp

ENDSSH

echo "✅ Migration complete!"

