#!/bin/bash
# Update production server DATABASE_URL
# Run this script to update the production server at abcoafrica.co.za

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "🔧 Updating DATABASE_URL on production server..."
echo "📡 Server: $SERVER"
echo ""

# The new database connection string - must be provided via environment variable
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL environment variable is required"
    echo "   Please export DATABASE_URL before running this script"
    exit 1
fi
NEW_DATABASE_URL="$DATABASE_URL"

ssh $SERVER << ENDSSH
set -e

cd $APP_DIR
echo "✅ Connected to server"
echo "📁 Current directory: \$(pwd)"
echo ""

# Update .env file
echo "📝 Updating .env file..."
if [ -f .env ]; then
    # Remove old DATABASE_URL if exists
    sed -i.bak '/^DATABASE_URL=/d' .env
    echo "✅ Removed old DATABASE_URL"
else
    echo "⚠️  .env file not found, creating new one..."
    touch .env
fi

# Add new DATABASE_URL
echo "DATABASE_URL=\"$NEW_DATABASE_URL\"" >> .env
echo "✅ Added new DATABASE_URL to .env"
echo ""

# Ensure other required variables exist
if ! grep -q "^JWT_SECRET=" .env; then
    echo "JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8" >> .env
    echo "✅ Added JWT_SECRET"
fi

if ! grep -q "^NODE_ENV=" .env; then
    echo "NODE_ENV=production" >> .env
    echo "✅ Added NODE_ENV"
fi

if ! grep -q "^PORT=" .env; then
    echo "PORT=3000" >> .env
    echo "✅ Added PORT"
fi

if ! grep -q "^APP_URL=" .env; then
    echo "APP_URL=https://abcoafrica.co.za" >> .env
    echo "✅ Added APP_URL"
fi

echo ""
echo "📋 Current .env DATABASE_URL (redacted):"
grep "^DATABASE_URL=" .env | sed 's/:[^@]*@/:***@/g'
echo ""

# Generate Prisma client
echo "🏗️  Generating Prisma client..."
npx prisma generate || echo "⚠️  Prisma generate had issues, continuing..."
echo ""

# Restart PM2
echo "🔄 Restarting application with PM2..."
if command -v pm2 &> /dev/null; then
    pm2 restart abcotronics-erp || pm2 start ecosystem.config.mjs || pm2 start server.js --name abcotronics-erp
    pm2 save
    echo "✅ Application restarted"
    echo ""
    echo "📊 PM2 Status:"
    pm2 status
else
    echo "⚠️  PM2 not found. Please restart the server manually."
fi

echo ""
echo "✅ Database URL update complete!"
echo "🌐 Server should now be accessible at: https://abcoafrica.co.za"
ENDSSH

echo ""
echo "✅ Production server updated!"
echo ""
echo "🧪 Test the server:"
echo "   curl https://abcoafrica.co.za/api/health"
echo ""

