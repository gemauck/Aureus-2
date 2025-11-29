#!/bin/bash
# Fix Database Hostname - Run this on production server

echo "🔧 Fixing Database Hostname"
echo "============================"
echo ""

# Correct database credentials
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

# Construct correct DATABASE_URL
CORRECT_DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}"

echo "📝 Correct DATABASE_URL:"
echo "   postgresql://${DB_USERNAME}:***@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}"
echo ""

# Find application directory
APP_DIR="/var/www/abcotronics-erp"
if [ ! -d "$APP_DIR" ] || [ ! -f "$APP_DIR/server.js" ]; then
    APP_DIR=$(find / -name "server.js" -type f 2>/dev/null | grep -v node_modules | head -1 | xargs dirname 2>/dev/null)
fi

if [ -z "$APP_DIR" ] || [ ! -f "$APP_DIR/server.js" ]; then
    echo "❌ Could not find application directory"
    echo "   Please run this script from your application directory"
    exit 1
fi

echo "📂 Application directory: $APP_DIR"
cd "$APP_DIR" || exit 1
echo ""

# Backup .env
if [ -f ".env" ]; then
    BACKUP_FILE=".env.backup.$(date +%Y%m%d_%H%M%S)"
    cp .env "$BACKUP_FILE"
    echo "✅ Backed up .env to: $BACKUP_FILE"
else
    echo "⚠️  No .env file found, will create new one"
    touch .env
fi
echo ""

# Show current DATABASE_URL (if exists)
if grep -q "^DATABASE_URL=" .env 2>/dev/null; then
    echo "📋 Current DATABASE_URL:"
    CURRENT_DB=$(grep "^DATABASE_URL=" .env | sed 's/:[^@]*@/:***@/')
    echo "   $CURRENT_DB"
    echo ""
fi

# Update DATABASE_URL
echo "📝 Updating DATABASE_URL..."
if grep -q "^DATABASE_URL=" .env 2>/dev/null; then
    # Update existing
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${CORRECT_DATABASE_URL}\"|" .env
    echo "✅ Updated existing DATABASE_URL"
else
    # Add new
    echo "" >> .env
    echo "DATABASE_URL=\"${CORRECT_DATABASE_URL}\"" >> .env
    echo "✅ Added DATABASE_URL to .env"
fi
echo ""

# Verify update
echo "🔍 Verifying DATABASE_URL..."
if grep -q "^DATABASE_URL=" .env; then
    echo "✅ DATABASE_URL is set:"
    grep "^DATABASE_URL=" .env | sed 's/:[^@]*@/:***@/'
    
    # Check if it has the correct hostname
    if grep -q "nov-3-backup5-do-user-28031752-0" .env; then
        echo "✅ Hostname is CORRECT (nov-3-backup5)"
    else
        echo "⚠️  WARNING: Hostname might still be incorrect"
        echo "   Current: $(grep "^DATABASE_URL=" .env | grep -o '@[^:]*' | sed 's/@//')"
    fi
else
    echo "❌ ERROR: DATABASE_URL not found in .env"
    exit 1
fi
echo ""

# Restart PM2
echo "🔄 Restarting PM2..."
if command -v pm2 &> /dev/null; then
    # Try to find PM2 app name
    PM2_APP=$(pm2 list | grep -v "┌\|─\|│\|└" | grep -v "App name" | grep -v "id" | head -1 | awk '{print $4}' 2>/dev/null)
    
    if [ -n "$PM2_APP" ] && [ "$PM2_APP" != "id" ] && [ "$PM2_APP" != "name" ]; then
        echo "🔄 Restarting: $PM2_APP"
        pm2 restart "$PM2_APP" --update-env
    else
        # Try common names
        for app in "abcotronics-erp" "erp-app" "server"; do
            if pm2 list | grep -q "$app"; then
                echo "🔄 Restarting: $app"
                pm2 restart "$app" --update-env
                break
            fi
        done
        
        # Fallback: restart all
        if pm2 list | grep -q "online\|stopped"; then
            echo "🔄 Restarting all PM2 apps..."
            pm2 restart all --update-env
        fi
    fi
    echo "✅ PM2 restarted"
else
    echo "⚠️  PM2 not found - restart your application manually"
fi
echo ""

# Wait and check logs
echo "⏳ Waiting 5 seconds for server to start..."
sleep 5
echo ""

echo "📋 Checking PM2 logs (last 30 lines)..."
echo "   Look for: '✅ Prisma database connection established'"
echo ""
if command -v pm2 &> /dev/null; then
    pm2 logs --lines 30 --nostream 2>/dev/null || pm2 logs --lines 30 2>/dev/null
fi
echo ""

echo "✅ Database hostname fix complete!"
echo ""
echo "🔍 Test the connection:"
echo "   curl https://abcoafrica.co.za/api/me"
echo ""

