#!/bin/bash
# Quick fix script - copy and paste these commands on the production server

echo "🔍 Step 1: Finding application directory..."

# Try common locations
if [ -d "/var/www/abcotronics-erp" ]; then
    APP_DIR="/var/www/abcotronics-erp"
elif [ -d "/home/deploy/abcotronics-erp" ]; then
    APP_DIR="/home/deploy/abcotronics-erp"
elif [ -d "/opt/abcotronics-erp" ]; then
    APP_DIR="/opt/abcotronics-erp"
else
    # Find server.js
    APP_DIR=$(find / -name "server.js" -type f 2>/dev/null | grep -v node_modules | head -1 | xargs dirname)
fi

if [ -z "$APP_DIR" ] || [ ! -f "$APP_DIR/server.js" ]; then
    echo "❌ Could not find application directory"
    echo "   Please run: find / -name 'server.js' -type f 2>/dev/null | grep -v node_modules"
    exit 1
fi

echo "✅ Found app directory: $APP_DIR"
cd "$APP_DIR" || exit 1

echo ""
echo "📝 Step 2: Updating .env file..."

# Backup existing .env
if [ -f ".env" ]; then
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
    echo "✅ Backed up existing .env"
fi

# Update or add DATABASE_URL
DATABASE_URL='postgresql://doadmin:AVNS_D14tRDDknkgUUoVZ4Bv@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require'

if grep -q "^DATABASE_URL=" .env 2>/dev/null; then
    # Update existing
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env
    echo "✅ Updated DATABASE_URL in .env"
else
    # Add new
    echo "" >> .env
    echo "DATABASE_URL=\"${DATABASE_URL}\"" >> .env
    echo "✅ Added DATABASE_URL to .env"
fi

echo ""
echo "🔍 Step 3: Verifying DATABASE_URL..."
if grep -q "^DATABASE_URL=" .env; then
    echo "✅ DATABASE_URL is set"
    grep "^DATABASE_URL=" .env | sed 's/:[^@]*@/:***@/'
else
    echo "❌ DATABASE_URL not found in .env"
    exit 1
fi

echo ""
echo "🔄 Step 4: Restarting PM2..."
pm2 restart all --update-env

echo ""
echo "⏳ Waiting 3 seconds..."
sleep 3

echo ""
echo "📋 Step 5: Checking logs..."
pm2 logs --lines 20 --nostream

echo ""
echo "✅ Done! Check the logs above for database connection status."
echo "   Look for: '✅ Prisma database connection established'"

