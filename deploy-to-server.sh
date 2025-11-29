#!/bin/bash
# Deploy code changes to server

set -e

echo "🚀 Deploying code changes to server..."
echo ""

# Server details
SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"
APP_PORT="3000"

echo "📡 Connecting to server..."
ssh $SERVER << ENDSSH
set -e

echo "✅ Connected to server"
echo ""

# Navigate to app directory
cd $APP_DIR
echo "📁 Current directory: \$(pwd)"

# Pull latest changes
echo ""
echo "📥 Pulling latest changes from GitHub..."
git fetch origin
git reset --hard origin/main || {
    echo "⚠️  Git reset failed, trying to stash changes..."
    git stash
    git reset --hard origin/main
}

# Clean untracked files that would conflict
git clean -fd

echo ""
echo "✅ Code updated"

# Install dependencies if needed (including dev dependencies for build)
echo ""
echo "📦 Installing/updating dependencies..."
if [ -f package.json ]; then
    # First try to install all dependencies (needed for build tools like esbuild)
    npm install || npm ci || echo "⚠️  npm install had issues, continuing..."
    
    # Specifically ensure esbuild is available for building
    if ! command -v npx &> /dev/null || ! npx esbuild --version &> /dev/null; then
        echo "📦 Installing esbuild for building..."
        npm install esbuild --save-dev || echo "⚠️  esbuild install failed, continuing..."
    fi
fi

# Build frontend (JSX → dist)
echo ""
echo "🏗️  Building frontend (JSX → dist)..."
if command -v npm &> /dev/null; then
    npm run build:jsx || node build-jsx.js || echo "⚠️  JSX build failed, continuing anyway..."
else
    echo "⚠️  npm not found, skipping build"
fi

# Generate Prisma client if needed
echo ""
echo "🗄️  Generating Prisma client..."
if command -v npx &> /dev/null && [ -f prisma/schema.prisma ]; then
    npx prisma generate || echo "⚠️  Prisma generate failed, continuing anyway..."
fi

# Set correct DATABASE_URL - ALWAYS use production database credentials
echo ""
echo "🔧 Setting correct DATABASE_URL in .env..."
# Load credentials from server-side file (created by setup-db-credentials-on-server.sh)
CREDS_FILE=".db-credentials.sh"
if [ -f "\$CREDS_FILE" ]; then
    source "\$CREDS_FILE"
    echo "✅ Loaded credentials from \$CREDS_FILE"
else
    echo "❌ ERROR: Credentials file not found: \$CREDS_FILE"
    echo "   Please run setup-db-credentials-on-server.sh first to create credentials file"
    exit 1
fi

DATABASE_URL="postgresql://\${DB_USERNAME}:\${DB_PASSWORD}@\${DB_HOST}:\${DB_PORT}/\${DB_NAME}?sslmode=\${DB_SSLMODE}"

# Backup existing .env if it exists
if [ -f ".env" ]; then
    cp .env .env.backup.\$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
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

# Verify DATABASE_URL
if grep -q "nov-3-backup5-do-user-28031752-0" .env; then
    echo "✅ Database hostname is CORRECT"
else
    echo "⚠️  WARNING: Database hostname might be incorrect!"
fi

# Restart the application
echo ""
echo "🔄 Restarting application..."
if command -v pm2 &> /dev/null; then
    pm2 restart abcotronics-erp --update-env || pm2 restart all --update-env
    echo "✅ Application restarted with PM2 (environment variables updated)"
    pm2 save || true
elif command -v systemctl &> /dev/null; then
    systemctl restart abcotronics-erp || echo "⚠️  Systemd service not found, app may be running differently"
else
    echo "⚠️  Neither PM2 nor systemctl found. Please restart the app manually."
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Update nginx configuration: /root/deploy-http2-jsx-fix.sh"
echo "   2. Test the application at https://abcoafrica.co.za"

ENDSSH

echo ""
echo "========================================="
echo "✅ Code deployment complete!"
echo "========================================="
echo ""
echo "📋 Next: Update nginx configuration"
echo ""
echo "Run this to update nginx:"
echo "  scp deploy-http2-jsx-fix.sh $SERVER:/root/"
echo "  ssh $SERVER"
echo "  chmod +x /root/deploy-http2-jsx-fix.sh"
echo "  /root/deploy-http2-jsx-fix.sh"
echo ""

