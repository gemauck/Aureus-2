#!/bin/bash
# Update DATABASE_URL on production server with new credentials
# This script updates the .env file on the production server

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

# New database connection string
# NOTE: Update this with the actual password from your secure storage
# The password should be retrieved from environment variables or secure vault
NEW_DATABASE_URL="postgresql://doadmin:${DB_PASSWORD:-YOUR_PASSWORD_HERE}@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require"

echo "🔧 Updating DATABASE_URL on production server..."
echo "📡 Server: $SERVER"
echo "📁 App Directory: $APP_DIR"
echo ""

ssh $SERVER << ENDSSH
set -e

cd $APP_DIR
echo "✅ Connected to server"
echo "📁 Current directory: \$(pwd)"
echo ""

# Backup existing .env file
if [ -f .env ]; then
    cp .env .env.backup.\$(date +%Y%m%d_%H%M%S)
    echo "✅ Backed up existing .env file"
fi

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

# Test database connection
echo "🧪 Testing database connection..."
if npx prisma db execute --stdin <<< "SELECT 1;" > /dev/null 2>&1; then
    echo "✅ Database connection test successful!"
else
    echo "⚠️  Database connection test had issues, but continuing..."
fi

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
    echo ""
    echo "📋 PM2 Logs (last 20 lines):"
    pm2 logs abcotronics-erp --lines 20 --nostream || true
else
    echo "⚠️  PM2 not found. Please restart the server manually."
fi

echo ""
echo "✅ Database connection update complete!"
echo "🌐 Server should now be accessible at: https://abcoafrica.co.za"
ENDSSH

echo ""
echo "✅ Production server updated!"
echo ""
echo "🧪 Test the server:"
echo "   curl https://abcoafrica.co.za/api/health"
echo ""
echo "📊 Check server logs:"
echo "   ssh $SERVER 'cd $APP_DIR && pm2 logs abcotronics-erp --lines 50'"
echo ""

