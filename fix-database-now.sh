#!/bin/bash
# Complete database fix script - Copy and paste this entire script on production server

echo "🔧 Production Database Connection Fix"
echo "======================================"
echo ""

# Step 1: Find application directory
echo "🔍 Step 1: Finding application directory..."
APP_DIR=""

# Try common locations first
for dir in "/var/www/abcotronics-erp" "/home/deploy/abcotronics-erp" "/opt/abcotronics-erp" "/root/abcotronics-erp"; do
    if [ -d "$dir" ] && [ -f "$dir/server.js" ]; then
        APP_DIR="$dir"
        break
    fi
done

# If not found, search for server.js
if [ -z "$APP_DIR" ]; then
    APP_DIR=$(find / -name "server.js" -type f 2>/dev/null | grep -v node_modules | grep -v ".git" | head -1 | xargs dirname 2>/dev/null)
fi

if [ -z "$APP_DIR" ] || [ ! -f "$APP_DIR/server.js" ]; then
    echo "❌ Could not find application directory"
    echo "   Searching for server.js..."
    find / -name "server.js" -type f 2>/dev/null | grep -v node_modules | head -5
    echo ""
    echo "   Please run this script from your application directory, or set APP_DIR:"
    echo "   export APP_DIR=/path/to/your/app"
    exit 1
fi

echo "✅ Found application directory: $APP_DIR"
cd "$APP_DIR" || exit 1
echo "📂 Current directory: $(pwd)"
echo ""

# Step 2: Backup existing .env
echo "📝 Step 2: Backing up existing .env (if exists)..."
if [ -f ".env" ]; then
    BACKUP_FILE=".env.backup.$(date +%Y%m%d_%H%M%S)"
    cp .env "$BACKUP_FILE"
    echo "✅ Backed up to: $BACKUP_FILE"
else
    echo "ℹ️  No existing .env file found, will create new one"
fi
echo ""

# Step 3: Set DATABASE_URL
echo "📝 Step 3: Setting DATABASE_URL..."
DATABASE_URL='postgresql://doadmin:AVNS_D14tRDDknkgUUoVZ4Bv@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require'

# Update or add DATABASE_URL
if [ -f ".env" ] && grep -q "^DATABASE_URL=" .env; then
    # Update existing DATABASE_URL
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env
    echo "✅ Updated existing DATABASE_URL in .env"
else
    # Add DATABASE_URL (create .env if it doesn't exist)
    if [ ! -f ".env" ]; then
        touch .env
    fi
    # Remove old DATABASE_URL line if exists (without ^ anchor)
    sed -i '/^DATABASE_URL=/d' .env 2>/dev/null
    # Add new DATABASE_URL
    echo "" >> .env
    echo "DATABASE_URL=\"${DATABASE_URL}\"" >> .env
    echo "✅ Added DATABASE_URL to .env"
fi
echo ""

# Step 4: Verify DATABASE_URL
echo "🔍 Step 4: Verifying DATABASE_URL..."
if grep -q "^DATABASE_URL=" .env; then
    echo "✅ DATABASE_URL is set correctly"
    # Show first part (hide password)
    grep "^DATABASE_URL=" .env | sed 's/:[^@]*@/:***@/'
else
    echo "❌ ERROR: DATABASE_URL not found in .env"
    exit 1
fi
echo ""

# Step 5: Restart PM2
echo "🔄 Step 5: Restarting PM2 with updated environment..."
if command -v pm2 &> /dev/null; then
    # Get PM2 app name
    PM2_APP=$(pm2 list | grep -v "┌\|─\|│\|└" | grep -v "App name" | grep -v "id" | head -1 | awk '{print $4}' 2>/dev/null)
    
    if [ -n "$PM2_APP" ] && [ "$PM2_APP" != "id" ] && [ "$PM2_APP" != "name" ]; then
        echo "🔄 Restarting PM2 app: $PM2_APP"
        pm2 restart "$PM2_APP" --update-env
    else
        # Try common app names
        for app_name in "abcotronics-erp" "erp-app" "server"; do
            if pm2 list | grep -q "$app_name"; then
                echo "🔄 Restarting PM2 app: $app_name"
                pm2 restart "$app_name" --update-env
                break
            fi
        done
        
        # If still not found, restart all
        if ! pm2 list | grep -q "online\|stopped"; then
            echo "🔄 Restarting all PM2 apps..."
            pm2 restart all --update-env
        fi
    fi
    echo "✅ PM2 restarted"
else
    echo "⚠️  PM2 not found. Please restart your application manually."
    echo "   Make sure to load the .env file when starting."
fi
echo ""

# Step 6: Wait and check logs
echo "⏳ Step 6: Waiting 3 seconds for server to start..."
sleep 3
echo ""

echo "📋 Step 7: Checking PM2 logs..."
if command -v pm2 &> /dev/null; then
    echo "   (Last 30 lines of logs)"
    echo "   Look for: '✅ Prisma database connection established'"
    echo ""
    pm2 logs --lines 30 --nostream 2>/dev/null || pm2 logs --lines 30 2>/dev/null
else
    echo "   PM2 not available - check your application logs manually"
fi
echo ""

echo "✅ Database connection fix complete!"
echo ""
echo "🔍 Next steps:"
echo "   1. Check if errors are resolved: curl https://abcoafrica.co.za/api/me"
echo "   2. Monitor logs: pm2 logs --lines 50"
echo "   3. If still errors, check:"
echo "      - Database server is accessible"
echo "      - Firewall allows port 25060"
echo "      - Credentials are correct"
echo ""


