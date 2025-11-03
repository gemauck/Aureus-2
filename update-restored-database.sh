#!/bin/bash
# Update Production Server to Use Restored Database
# Run this from your local machine to update the droplet

DROPLET_IP="165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"

# Restored database connection details (from 10 PM backup - Nov 3, 2025)
DB_USER="doadmin"
DB_PASSWORD="${DB_PASSWORD}"
DB_HOST="dbaas-db-6934625-nov-3-backup-nov-3-backup2-do-user-28031752-0.e.db.ondigitalocean.com"
DB_PORT="25060"
DB_NAME="defaultdb"

# Build connection string
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require"

echo "🔄 Updating production server to use restored database..."
echo "📍 Server: ${DROPLET_IP}"
echo "📊 New Host: ${DB_HOST}"

ssh root@${DROPLET_IP} << ENDSSH
set -e

echo "✅ Connected to droplet"

cd ${APP_DIR}

# Update .env file
echo "📝 Updating .env file..."
if [ -f .env ]; then
    # Backup existing .env
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
    echo "✅ Backed up existing .env file"
fi

# Update DATABASE_URL in .env
sed -i "s|DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env || echo "DATABASE_URL=\"${DATABASE_URL}\"" >> .env

# Update PM2 ecosystem config if it exists
if [ -f ecosystem.config.cjs ]; then
    echo "📝 Updating ecosystem.config.cjs..."
    cp ecosystem.config.cjs ecosystem.config.cjs.backup.$(date +%Y%m%d_%H%M%S)
    
    # Update DATABASE_URL in ecosystem.config.cjs (escaped for sed)
    ESCAPED_URL=$(echo "${DATABASE_URL}" | sed 's/[[\.*^$()+?{|]/\\&/g')
    sed -i "s|DATABASE_URL:.*|DATABASE_URL: '${DATABASE_URL}',|" ecosystem.config.cjs
    
    echo "✅ Updated ecosystem.config.cjs"
fi

# Test connection
echo "🧪 Testing database connection..."
export DATABASE_URL="${DATABASE_URL}"
npx prisma db execute --stdin <<< "SELECT 1;" > /dev/null 2>&1 && echo "✅ Database connection successful" || echo "⚠️  Database connection test failed - please verify credentials"

# Restart PM2
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp || pm2 start ecosystem.config.cjs || pm2 start server.js --name abcotronics-erp

echo "✅ Update complete!"
echo "📊 Check logs: pm2 logs abcotronics-erp"

ENDSSH

echo ""
echo "✅ Database connection updated on production server"
echo ""
echo "Next steps:"
echo "1. Check server logs: ssh root@${DROPLET_IP} 'cd ${APP_DIR} && pm2 logs abcotronics-erp'"
echo "2. Test health endpoint: curl https://abcoafrica.co.za/api/health"
echo "3. Verify data: Check your app at https://abcoafrica.co.za"

