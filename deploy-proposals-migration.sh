#!/bin/bash
# Deploy Proposals Migration to Production Server

DROPLET_IP="165.22.127.196"

echo "🔧 Deploying Proposals Migration to Production..."

ssh root@$DROPLET_IP << 'ENDSSH'
cd /var/www/abcotronics-erp

# Load DATABASE_URL from .env
export $(cat .env | grep -v '^#' | xargs)

echo "📝 Applying proposals migration SQL..."

# Apply the migration using psql directly
psql "$DATABASE_URL" << 'SQL'
-- Add proposals column if it doesn't exist
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "proposals" TEXT DEFAULT '[]';

-- Verify the changes
SELECT 'Proposals column added successfully' as status;
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'Client' AND column_name = 'proposals';
SQL

echo "✅ Migration applied!"
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp

ENDSSH

echo "✅ Deployment complete!"
echo ""
echo "📋 Summary:"
echo "  - Added 'proposals' column to Client table"
echo "  - Default value: '[]' (empty array)"
echo "  - Restarted application"

