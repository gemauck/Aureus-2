#!/bin/bash
# Fix database connection on Droplet
# Run: ssh root@165.22.127.196 'bash -s' < fix-droplet-database.sh

set -e

APP_DIR="/var/www/abcotronics-erp"
APP_NAME="abcotronics-erp"

echo "🔧 Fixing Database Connection on Droplet"
echo "========================================"
echo ""

# SSH into droplet and run fix
ssh root@165.22.127.196 << 'ENDSSH'
set -e

cd /var/www/abcotronics-erp
echo "📁 Current directory: $(pwd)"
echo ""

# Step 1: Check current DATABASE_URL
echo "1️⃣ Checking current DATABASE_URL..."
if [ -f .env ]; then
    CURRENT_DB=$(grep DATABASE_URL .env | cut -d '=' -f2- | tr -d '"' | tr -d "'" || echo "")
    echo "   Current: $CURRENT_DB"
else
    echo "   .env file not found"
fi

# Check PM2 config
if [ -f ecosystem.config.mjs ]; then
    PM2_DB=$(grep -A 10 "env:" ecosystem.config.mjs | grep DATABASE_URL | cut -d "'" -f2 || echo "")
    echo "   PM2 config: $PM2_DB"
fi
echo ""

# Step 2: Check if PostgreSQL is installed and running
echo "2️⃣ Checking PostgreSQL..."
if command -v psql &> /dev/null; then
    echo "✅ PostgreSQL client installed"
    
    if systemctl is-active --quiet postgresql; then
        echo "✅ PostgreSQL service is running"
    else
        echo "⚠️  PostgreSQL service not running"
        echo "   Starting PostgreSQL..."
        systemctl start postgresql || echo "   Failed to start"
    fi
else
    echo "❌ PostgreSQL not installed!"
    echo "   Installing PostgreSQL..."
    apt-get update
    apt-get install -y postgresql postgresql-contrib
    systemctl start postgresql
    systemctl enable postgresql
fi
echo ""

# Step 3: Check if database exists
echo "3️⃣ Checking database..."
DB_NAME="abcotronics_erp"
DB_USER="postgres"

# Try to connect and check if database exists
if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    echo "✅ Database '$DB_NAME' exists"
else
    echo "⚠️  Database '$DB_NAME' does not exist"
    echo "   Creating database..."
    sudo -u postgres createdb $DB_NAME || echo "   Database creation failed or already exists"
fi
echo ""

# Step 4: Update DATABASE_URL in .env
echo "4️⃣ Updating DATABASE_URL in .env..."
if [ ! -f .env ]; then
    echo "   Creating .env file..."
    touch .env
fi

# Get PostgreSQL password (or use default)
# For now, use postgres user with no password (local only)
DB_URL="postgresql://postgres@localhost:5432/$DB_NAME"

# Update or add DATABASE_URL
if grep -q "DATABASE_URL" .env; then
    # Update existing
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=\"$DB_URL\"|" .env
    echo "✅ Updated DATABASE_URL in .env"
else
    # Add new
    echo "DATABASE_URL=\"$DB_URL\"" >> .env
    echo "✅ Added DATABASE_URL to .env"
fi

echo "   New DATABASE_URL: $DB_URL"
echo ""

# Step 5: Update PM2 ecosystem config
echo "5️⃣ Updating PM2 ecosystem config..."
if [ -f ecosystem.config.mjs ]; then
    # Backup original
    cp ecosystem.config.mjs ecosystem.config.mjs.backup
    
    # Update DATABASE_URL in ecosystem config
    sed -i "s|DATABASE_URL: 'file:.*'|DATABASE_URL: '$DB_URL'|" ecosystem.config.mjs
    echo "✅ Updated PM2 ecosystem config"
else
    echo "⚠️  ecosystem.config.mjs not found"
fi
echo ""

# Step 6: Generate Prisma client
echo "6️⃣ Generating Prisma client..."
npx prisma generate || echo "⚠️  Prisma generate had issues"
echo ""

# Step 7: Push database schema
echo "7️⃣ Pushing database schema..."
npx prisma db push || echo "⚠️  Database push had issues (may need manual migration)"
echo ""

# Step 8: Restart application
echo "8️⃣ Restarting application..."
pm2 restart $APP_NAME || pm2 start ecosystem.config.mjs
pm2 save
echo "✅ Application restarted"
echo ""

# Step 9: Test connection
echo "9️⃣ Testing database connection..."
sleep 3
if curl -s http://localhost:3000/health | grep -q "connected"; then
    echo "✅ Health check shows database connected!"
else
    echo "⚠️  Health check may show issues - check logs:"
    echo "   pm2 logs $APP_NAME --lines 20"
fi
echo ""

echo "✅ Database fix complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Check logs: pm2 logs $APP_NAME"
echo "   2. Test API: curl http://localhost:3000/api/test-db-connection"
echo "   3. Check health: curl http://localhost:3000/health"
ENDSSH

echo ""
echo "✅ Fix script completed!"
echo "💡 SSH into droplet and check logs if issues persist"

