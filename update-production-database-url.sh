#!/bin/bash
# Update production server database URL with correct credentials

set -e

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

# Database credentials
# Use environment variables for security - set these in your deployment environment
DB_USERNAME="${DB_USERNAME:-doadmin}"
DB_PASSWORD="${DB_PASSWORD:-${DATABASE_PASSWORD}}"
DB_HOST="${DB_HOST:-dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com}"
DB_PORT="${DB_PORT:-25060}"
DB_NAME="${DB_NAME:-defaultdb}"
DB_SSLMODE="${DB_SSLMODE:-require}"

if [ -z "$DB_PASSWORD" ]; then
    echo "❌ ERROR: DB_PASSWORD or DATABASE_PASSWORD environment variable must be set"
    exit 1
fi

# Construct DATABASE_URL
DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}"

echo "🔧 Updating production database URL..."
echo "📡 Server: $SERVER"
echo "📁 App Directory: $APP_DIR"
echo ""
echo "📝 New DATABASE_URL:"
echo "   postgresql://${DB_USERNAME}:***@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}"
echo ""

# Update on server
ssh $SERVER << ENDSSH
set -e

cd $APP_DIR

echo "📋 Current DATABASE_URL in .env:"
if grep -q "^DATABASE_URL=" .env 2>/dev/null; then
    grep "^DATABASE_URL=" .env | sed 's/:[^@]*@/:***@/'
else
    echo "   ⚠️  DATABASE_URL not found in .env"
fi

echo ""
echo "📝 Updating DATABASE_URL in .env..."
if grep -q "^DATABASE_URL=" .env 2>/dev/null; then
    # Update existing DATABASE_URL
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env
    echo "✅ Updated DATABASE_URL in .env"
else
    # Add DATABASE_URL if it doesn't exist
    echo "DATABASE_URL=\"${DATABASE_URL}\"" >> .env
    echo "✅ Added DATABASE_URL to .env"
fi

echo ""
echo "🔍 Verifying DATABASE_URL..."
if grep -q "^DATABASE_URL=" .env; then
    echo "✅ DATABASE_URL is set:"
    grep "^DATABASE_URL=" .env | sed 's/:[^@]*@/:***@/'
else
    echo "❌ ERROR: DATABASE_URL not found in .env"
    exit 1
fi

echo ""
echo "🔄 Restarting application with updated database URL..."
pm2 restart abcotronics-erp --update-env || pm2 start server.js --name abcotronics-erp --update-env

echo ""
echo "⏳ Waiting 3 seconds for app to start..."
sleep 3

echo ""
echo "📊 PM2 Status:"
pm2 list

echo ""
echo "✅ Database URL updated and application restarted!"
ENDSSH

echo ""
echo "✅ Production database URL updated successfully!"
echo "🌐 Check your site: https://abcoafrica.co.za"

