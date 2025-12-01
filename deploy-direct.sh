#!/bin/bash
# Deploy directly to production server via rsync (bypasses git)

set -e

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"
LOCAL_DIR="$(pwd)"

echo "🚀 Deploying directly to Production..."
echo "📡 Server: $SERVER"
echo "📁 Local: $LOCAL_DIR"
echo ""

# Step 1: Build everything
echo "🏗️  Building project..."
npm run build
echo "✅ Build complete"
echo ""

# Step 2: Deploy via rsync
echo "📤 Copying files to server..."
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '*.log' \
  --exclude 'dist/node_modules' \
  --exclude '.DS_Store' \
  --exclude '*.md' \
  --exclude '*.sh' \
  --exclude 'test-*.js' \
  --exclude 'check-*.sh' \
  --exclude 'compare-*.sh' \
  --exclude 'diagnose-*.sh' \
  --exclude 'update-*.sh' \
  --exclude 'RESTORED-DATABASE-SETUP.md' \
  "$LOCAL_DIR/" "$SERVER:$APP_DIR/"

echo "✅ Files copied"
echo ""

# Step 3: Install dependencies, set database URL, and restart on server
echo "🔧 Installing dependencies, setting database URL, and restarting..."
ssh $SERVER << 'DEPLOY'
set -e

cd /var/www/abcotronics-erp

echo "📦 Installing dependencies..."
npm install --production

echo "🏗️  Generating Prisma client..."
npx prisma generate || echo "⚠️  Prisma generate skipped"

# Set correct DATABASE_URL - ALWAYS use production database credentials
echo ""
echo "🔧 Setting correct DATABASE_URL everywhere..."
# Production database credentials (ALWAYS use these)
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

DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}"

echo "   Host: $DB_HOST"
echo "   Port: $DB_PORT"
echo "   Database: $DB_NAME"

# Backup existing .env if it exists
if [ -f ".env" ]; then
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
fi

# Update or add DATABASE_URL in .env
if grep -q "^DATABASE_URL=" .env 2>/dev/null; then
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env
    echo "✅ Updated DATABASE_URL in .env"
else
    echo "DATABASE_URL=\"${DATABASE_URL}\"" >> .env
    echo "✅ Added DATABASE_URL to .env"
fi

# Also update /etc/environment (system-wide)
echo ""
echo "🔧 Updating /etc/environment (system-wide)..."
if [ -f "/etc/environment" ]; then
    cp /etc/environment /etc/environment.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
    # Remove old DATABASE_URL line
    sed -i '/^DATABASE_URL=/d' /etc/environment
    # Add new DATABASE_URL
    echo "DATABASE_URL=\"${DATABASE_URL}\"" >> /etc/environment
    echo "✅ Updated DATABASE_URL in /etc/environment"
else
    echo "DATABASE_URL=\"${DATABASE_URL}\"" > /etc/environment
    echo "✅ Created /etc/environment with DATABASE_URL"
fi

# Remove .env.local if it exists (it overrides .env and may have wrong credentials)
echo ""
echo "🔧 Removing .env.local if it exists (prevents override of .env)..."
if [ -f .env.local ]; then
    echo "   ⚠️  Found .env.local - removing it to prevent override"
    rm -f .env.local
    echo "   ✅ Removed .env.local"
else
    echo "   ✅ .env.local does not exist"
fi

echo ""
echo "🔍 Verifying DATABASE_URL is set correctly..."
if grep -q "^DATABASE_URL=" .env; then
    echo "✅ DATABASE_URL found in .env:"
    grep "^DATABASE_URL=" .env | sed 's/:[^@]*@/:***@/' | head -1
    
    # Verify it has the correct hostname
    if grep -q "nov-3-backup5-do-user-28031752-0" .env; then
        echo "✅ Database hostname is CORRECT"
    else
        echo "⚠️  WARNING: Database hostname might be incorrect!"
        exit 1
    fi
else
    echo "❌ ERROR: DATABASE_URL not found in .env!"
    exit 1
fi

echo ""
echo "🔄 Clearing Prisma cache and regenerating client..."
rm -rf node_modules/.prisma 2>/dev/null || true
npx prisma generate || echo "⚠️  Prisma generate skipped"

echo ""
echo "🔄 Restarting application with updated environment..."
# Source environment to ensure DATABASE_URL is loaded
set -a
[ -f /etc/environment ] && source /etc/environment
set +a

# Use pm2 restart which is safer than delete/start
cd /var/www/abcotronics-erp
pm2 restart abcotronics-erp --update-env || pm2 start server.js --name abcotronics-erp --update-env

echo ""
echo "✅ Deployment complete!"
echo "🌐 Check your site: https://abcoafrica.co.za"
DEPLOY

echo ""
echo "✅ Deployment successful!"
echo "💡 Hard refresh your browser (Cmd+Shift+R / Ctrl+Shift+R) to see the changes"

