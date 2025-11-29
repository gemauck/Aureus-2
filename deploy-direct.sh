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
echo "🔧 Setting correct DATABASE_URL in .env..."
# Load credentials from server-side file (created by setup-db-credentials-on-server.sh)
CREDS_FILE=".db-credentials.sh"
if [ -f "$CREDS_FILE" ]; then
    source "$CREDS_FILE"
    echo "✅ Loaded credentials from $CREDS_FILE"
else
    echo "❌ ERROR: Credentials file not found: $CREDS_FILE"
    echo "   Please run setup-db-credentials-on-server.sh first to create credentials file"
    echo "   Or create $CREDS_FILE manually with:"
    echo "     export DB_USERNAME=\"doadmin\""
    echo "     export DB_PASSWORD=\"[your-password]\""
    echo "     export DB_HOST=\"dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com\""
    echo "     export DB_PORT=\"25060\""
    echo "     export DB_NAME=\"defaultdb\""
    echo "     export DB_SSLMODE=\"require\""
    exit 1
fi

DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}"

# Backup existing .env if it exists
if [ -f ".env" ]; then
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
fi

# Update or add DATABASE_URL
if grep -q "^DATABASE_URL=" .env 2>/dev/null; then
    # Update existing DATABASE_URL
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env
    echo "✅ Updated DATABASE_URL in .env"
else
    # Add DATABASE_URL if it doesn't exist
    echo "DATABASE_URL=\"${DATABASE_URL}\"" >> .env
    echo "✅ Added DATABASE_URL to .env"
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
echo "🔄 Restarting application with updated environment..."
pm2 restart abcotronics-erp --update-env || pm2 start server.js --name abcotronics-erp --update-env

echo ""
echo "✅ Deployment complete!"
echo "🌐 Check your site: https://abcoafrica.co.za"
DEPLOY

echo ""
echo "✅ Deployment successful!"
echo "💡 Hard refresh your browser (Cmd+Shift+R / Ctrl+Shift+R) to see the changes"

