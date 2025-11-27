#!/bin/bash

# Apply SQL migration for Service & Maintenance dynamic forms/checklists
# This will create the ServiceFormTemplate and ServiceFormInstance tables
# in the production Postgres database, matching the Prisma schema.
#
# The migration is additive-only (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS)
# and is safe to run multiple times.

set -e

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"
SQL_FILE_LOCAL="add-service-forms-migration.sql"
SQL_FILE_REMOTE="/tmp/add-service-forms-migration.sql"

echo "🚀 Applying SQL Migration for Service & Maintenance Forms"
echo "========================================================="
echo ""

if [ ! -f "$SQL_FILE_LOCAL" ]; then
  echo "❌ SQL file not found: $SQL_FILE_LOCAL"
  exit 1
fi

echo "📤 Copying SQL file to server..."
scp "$SQL_FILE_LOCAL" "$SERVER:$SQL_FILE_REMOTE"

echo ""
echo "🔌 Applying migration on server..."
ssh "$SERVER" << ENDSSH
set -e

cd "$APP_DIR"

# Load environment variables from .env
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

echo "📝 Applying SQL migration for ServiceFormTemplate/ServiceFormInstance..."
if [ -n "\$DATABASE_URL" ]; then
  echo "✅ DATABASE_URL loaded"

  psql "\$DATABASE_URL" -f "$SQL_FILE_REMOTE"

  if [ \$? -eq 0 ]; then
    echo "✅ SQL migration applied successfully!"

    echo ""
    echo "🔍 Verifying service forms tables were created..."
    psql "\$DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('ServiceFormTemplate', 'ServiceFormInstance') ORDER BY table_name;"

    echo ""
    echo "🔄 Regenerating Prisma client..."
    npx prisma generate

    echo ""
    echo "🔄 Restarting application..."
    pm2 restart abcotronics-erp || pm2 start server.js --name abcotronics-erp

    echo ""
    echo "✅ Service forms migration complete!"
  else
    echo "❌ SQL migration failed"
    exit 1
  fi
else
  echo "❌ DATABASE_URL not set"
  echo "   Current directory: \$(pwd)"
  echo "   .env file exists: \$([ -f .env ] && echo 'yes' || echo 'no')"
  exit 1
fi
ENDSSH

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Service forms migration completed successfully!"
  echo ""
  echo "🌐 Test at: https://abcoafrica.co.za"
  echo "   Navigate to: Operations → Service & Maintenance → Form Builder"
else
  echo ""
  echo "❌ Service forms migration failed"
  exit 1
fi



