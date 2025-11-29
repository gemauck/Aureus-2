#!/bin/bash
# Fix Production Database Connection - Update both .env and .env.local

echo "🔧 Fixing Production Database Connection"
echo "========================================"
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
    APP_DIR=$(pwd)
    if [ ! -f "$APP_DIR/server.js" ]; then
        echo "❌ Could not find application directory"
        echo "   Please run this script from your application directory"
        exit 1
    fi
fi

echo "📂 Application directory: $APP_DIR"
cd "$APP_DIR" || exit 1
echo ""

# Check current state
echo "=== Current State ==="
if [ -f ".env" ]; then
    echo "📄 .env file exists"
    if grep -q "^DATABASE_URL=" .env; then
        echo "   Current DATABASE_URL in .env:"
        grep "^DATABASE_URL=" .env | sed 's/:[^@]*@/:***@/'
    else
        echo "   ⚠️  No DATABASE_URL in .env"
    fi
else
    echo "⚠️  .env file not found, will create"
fi

echo ""
if [ -f ".env.local" ]; then
    echo "⚠️  .env.local file exists (THIS OVERRIDES .env!)"
    if grep -q "^DATABASE_URL=" .env.local; then
        echo "   Current DATABASE_URL in .env.local:"
        grep "^DATABASE_URL=" .env.local | sed 's/:[^@]*@/:***@/'
    else
        echo "   ⚠️  No DATABASE_URL in .env.local"
    fi
else
    echo "✅ No .env.local file"
fi
echo ""

# Backup files
echo "=== Backing up files ==="
if [ -f ".env" ]; then
    BACKUP_ENV=".env.backup.$(date +%Y%m%d_%H%M%S)"
    cp .env "$BACKUP_ENV"
    echo "✅ Backed up .env to: $BACKUP_ENV"
fi

if [ -f ".env.local" ]; then
    BACKUP_LOCAL=".env.local.backup.$(date +%Y%m%d_%H%M%S)"
    cp .env.local "$BACKUP_LOCAL"
    echo "✅ Backed up .env.local to: $BACKUP_LOCAL"
fi
echo ""

# Update .env file
echo "=== Updating .env file ==="
if [ -f ".env" ]; then
    if grep -q "^DATABASE_URL=" .env; then
        # Update existing
        sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${CORRECT_DATABASE_URL}\"|" .env
        echo "✅ Updated existing DATABASE_URL in .env"
    else
        # Add new
        echo "" >> .env
        echo "DATABASE_URL=\"${CORRECT_DATABASE_URL}\"" >> .env
        echo "✅ Added DATABASE_URL to .env"
    fi
else
    # Create new .env file
    cat > .env << EOF
# Database Connection (Digital Ocean PostgreSQL)
DATABASE_URL="${CORRECT_DATABASE_URL}"

# JWT Secret
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8

# Application Settings
NODE_ENV=production
PORT=3000
EOF
    echo "✅ Created new .env file"
fi
echo ""

# Update .env.local file (this is critical - it overrides .env!)
echo "=== Updating .env.local file ==="
if [ -f ".env.local" ]; then
    if grep -q "^DATABASE_URL=" .env.local; then
        # Update existing
        sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${CORRECT_DATABASE_URL}\"|" .env.local
        echo "✅ Updated existing DATABASE_URL in .env.local"
    else
        # Add new
        echo "" >> .env.local
        echo "DATABASE_URL=\"${CORRECT_DATABASE_URL}\"" >> .env.local
        echo "✅ Added DATABASE_URL to .env.local"
    fi
else
    # Create .env.local with correct DATABASE_URL
    echo "DATABASE_URL=\"${CORRECT_DATABASE_URL}\"" > .env.local
    echo "✅ Created .env.local with correct DATABASE_URL"
fi
echo ""

# Verify updates
echo "=== Verifying updates ==="
echo "📄 .env DATABASE_URL:"
if grep -q "^DATABASE_URL=" .env; then
    grep "^DATABASE_URL=" .env | sed 's/:[^@]*@/:***@/'
    if grep -q "nov-3-backup5-do-user-28031752-0" .env; then
        echo "   ✅ Correct hostname found in .env"
    else
        echo "   ❌ WARNING: Hostname might be incorrect"
    fi
else
    echo "   ❌ DATABASE_URL not found in .env"
fi

echo ""
echo "📄 .env.local DATABASE_URL:"
if grep -q "^DATABASE_URL=" .env.local; then
    grep "^DATABASE_URL=" .env.local | sed 's/:[^@]*@/:***@/'
    if grep -q "nov-3-backup5-do-user-28031752-0" .env.local; then
        echo "   ✅ Correct hostname found in .env.local"
    else
        echo "   ❌ WARNING: Hostname might be incorrect"
    fi
else
    echo "   ❌ DATABASE_URL not found in .env.local"
fi
echo ""

# Restart PM2
echo "=== Restarting PM2 ==="
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

echo "=== Checking logs for database connection ==="
echo "   (Look for '✅ Prisma database connection established' or the new hostname)"
echo ""
if command -v pm2 &> /dev/null; then
    echo "Recent logs:"
    pm2 logs --lines 30 --nostream 2>/dev/null | grep -i "database\|prisma\|connection\|nov-3-backup5" | tail -15 || pm2 logs --lines 30 --nostream 2>/dev/null | tail -15
fi
echo ""

echo "✅ Database connection fix complete!"
echo ""
echo "🔍 Next steps:"
echo "   1. Check if you see the new hostname in logs: nov-3-backup5-do-user-28031752-0"
echo "   2. Look for: '✅ Prisma database connection established'"
echo "   3. Test login at: https://abcoafrica.co.za"
echo ""
echo "   If you still see connection errors, check:"
echo "      - Both .env and .env.local have the correct DATABASE_URL"
echo "      - PM2 restarted with --update-env flag"
echo "      - Database server is accessible from this server"
echo ""

