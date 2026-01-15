#!/bin/bash
# Deploy directly to production server via rsync (bypasses git)

set -e

SERVER_DOMAIN="root@abcoafrica.co.za"
SERVER_IP="root@165.22.127.196"
APP_DIR="/var/www/abcotronics-erp"
LOCAL_DIR="$(pwd)"

echo "🚀 Deploying directly to Production..."
echo "📁 Local: $LOCAL_DIR"
echo ""

# Step 0: Test SSH connection (try domain first, then IP)
echo "🔌 Testing SSH connection..."
SERVER=""
if ssh -o ConnectTimeout=10 -o BatchMode=yes $SERVER_DOMAIN "echo 'SSH connection successful'" 2>/dev/null; then
    SERVER="$SERVER_DOMAIN"
    echo "✅ SSH connection successful via domain: $SERVER_DOMAIN"
elif ssh -o ConnectTimeout=10 -o BatchMode=yes $SERVER_IP "echo 'SSH connection successful'" 2>/dev/null; then
    SERVER="$SERVER_IP"
    echo "✅ SSH connection successful via IP: $SERVER_IP"
else
    echo "❌ ERROR: Cannot connect to server via SSH"
    echo "   Tried:"
    echo "   - $SERVER_DOMAIN"
    echo "   - $SERVER_IP"
    echo ""
    echo "   Please check:"
    echo "   1. Server is running and accessible"
    echo "   2. SSH keys are configured correctly"
    echo "   3. Firewall allows SSH connections"
    echo "   4. Server hostname/IP is correct"
    echo ""
    echo "   Try manually:"
    echo "   - ssh $SERVER_DOMAIN"
    echo "   - ssh $SERVER_IP"
    exit 1
fi
echo ""

# Step 1: Build everything
echo "🏗️  Building project..."
npm run build
echo "✅ Build complete"
echo ""

# Step 2: Deploy via rsync
echo "📤 Copying files to server..."
if ! rsync -avz --progress \
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
  "$LOCAL_DIR/" "$SERVER:$APP_DIR/"; then
    echo "❌ ERROR: Failed to copy files to server"
    exit 1
fi

echo "✅ Files copied"
echo ""

# Step 3: Install dependencies, set database URL, and restart on server
echo "🔧 Installing dependencies, setting database URL, and restarting..."

# Pass DB credentials via environment variables if provided
# Note: We'll primarily rely on server's existing .env file
SSH_ENV_VARS=""
if [ -n "$DB_PASSWORD" ] || [ -n "$DATABASE_PASSWORD" ]; then
    DB_PASS="${DB_PASSWORD:-$DATABASE_PASSWORD}"
    SSH_ENV_VARS="DB_USERNAME='${DB_USERNAME:-doadmin}' DB_PASSWORD='$DB_PASS' DB_HOST='${DB_HOST:-dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com}' DB_PORT='${DB_PORT:-25060}' DB_NAME='${DB_NAME:-defaultdb}' DB_SSLMODE='${DB_SSLMODE:-require}'"
fi

ssh $SERVER "$SSH_ENV_VARS" bash << 'DEPLOY'
set -e

cd /var/www/abcotronics-erp

echo "📦 Installing dependencies..."
npm install --production

echo "🏗️  Generating Prisma client..."
npx prisma generate || echo "⚠️  Prisma generate skipped"

# Set correct DATABASE_URL - try to preserve existing or use provided credentials
echo ""
echo "🔧 Setting correct DATABASE_URL everywhere..."

# First, try to read existing DATABASE_URL from server .env file
EXISTING_DB_URL=""
if [ -f ".env" ] && grep -q "^DATABASE_URL=" .env 2>/dev/null; then
    EXISTING_DB_URL=$(grep "^DATABASE_URL=" .env | sed 's/^DATABASE_URL=//' | sed 's/^"//' | sed 's/"$//' | sed "s/^'//" | sed "s/'$//")
    if [ -n "$EXISTING_DB_URL" ] && [[ "$EXISTING_DB_URL" == postgresql://* ]]; then
        echo "✅ Found existing DATABASE_URL in server .env file"
        DATABASE_URL="$EXISTING_DB_URL"
    else
        EXISTING_DB_URL=""
    fi
fi

# If no valid existing URL, try to construct from environment variables
# Note: Environment variables need to be passed via SSH, so we'll check if they're available
if [ -z "$EXISTING_DB_URL" ]; then
    # Production database credentials (defaults)
    DB_USERNAME="${DB_USERNAME:-doadmin}"
    DB_PASSWORD="${DB_PASSWORD:-${DATABASE_PASSWORD}}"
    DB_HOST="${DB_HOST:-dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com}"
    DB_PORT="${DB_PORT:-25060}"
    DB_NAME="${DB_NAME:-defaultdb}"
    DB_SSLMODE="${DB_SSLMODE:-require}"

    if [ -z "$DB_PASSWORD" ]; then
        echo "⚠️  WARNING: DB_PASSWORD environment variable not set"
        echo "   Attempting to preserve existing DATABASE_URL from server..."
        # If we can't construct a new one and don't have an existing one, we have a problem
        if [ -z "$EXISTING_DB_URL" ]; then
            echo "❌ ERROR: Cannot determine DATABASE_URL"
            echo "   Please either:"
            echo "   1. Export DB_PASSWORD before running: export DB_PASSWORD='your-password'"
            echo "   2. Ensure server .env file has a valid DATABASE_URL"
            echo ""
            echo "   The script will try to preserve the existing DATABASE_URL if present."
            # Don't exit - let's try to continue with existing .env
            set +e  # Temporarily disable exit on error
        fi
    else
        DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}"
        echo "✅ Constructed DATABASE_URL from environment variables"
    fi
fi

# Display database info (masking password)
if [ -n "$DATABASE_URL" ] && [[ "$DATABASE_URL" == postgresql://* ]]; then
    DB_INFO=$(echo "$DATABASE_URL" | sed 's|postgresql://[^:]*:[^@]*@\([^:]*\):\([^/]*\)/\([^?]*\).*|\1:\2/\3|')
    echo "   Database: postgresql://***@${DB_INFO}"
else
    echo "⚠️  No DATABASE_URL available - will preserve existing .env file"
    set +e  # Don't exit on error if DATABASE_URL is missing
fi

# Backup existing .env if it exists
if [ -f ".env" ]; then
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
fi

# Update or add DATABASE_URL in .env (only if we have a valid URL)
if [ -n "$DATABASE_URL" ] && [[ "$DATABASE_URL" == postgresql://* ]]; then
    if grep -q "^DATABASE_URL=" .env 2>/dev/null; then
        sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env
        echo "✅ Updated DATABASE_URL in .env"
    else
        echo "DATABASE_URL=\"${DATABASE_URL}\"" >> .env
        echo "✅ Added DATABASE_URL to .env"
    fi
else
    echo "⚠️  Skipping DATABASE_URL update (preserving existing or missing)"
fi

# Re-enable exit on error
set -e

# Also update /etc/environment (system-wide) - only if we have a valid URL
if [ -n "$DATABASE_URL" ] && [[ "$DATABASE_URL" == postgresql://* ]]; then
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
else
    echo ""
    echo "⚠️  Skipping /etc/environment update (no valid DATABASE_URL)"
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
    
    # Verify it's a PostgreSQL URL
    if grep -q "postgresql://" .env; then
        echo "✅ DATABASE_URL is valid PostgreSQL connection string"
    else
        echo "⚠️  WARNING: DATABASE_URL might not be a valid PostgreSQL connection!"
    fi
else
    echo "⚠️  WARNING: DATABASE_URL not found in .env!"
    echo "   The application may not start correctly without DATABASE_URL"
fi

echo ""
echo "🔄 Clearing Prisma cache and regenerating client..."
rm -rf node_modules/.prisma 2>/dev/null || true
npx prisma generate || echo "⚠️  Prisma generate skipped"

echo ""
echo "🗄️  Applying database schema changes via safe migration wrapper..."
if ! bash ./scripts/safe-db-migration.sh npx prisma migrate deploy; then
    echo "⚠️  Safe migration wrapper reported an error or no migrations to apply"
    echo "   Skipping additional schema changes to avoid data loss"
fi

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

