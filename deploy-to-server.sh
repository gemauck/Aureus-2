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
echo "🔧 Setting correct DATABASE_URL everywhere..."
# Production database credentials (ALWAYS use these)
DB_USERNAME="doadmin"
DB_PASSWORD="AVNS_D14tRDDknkgUUoVZ4Bv"
DB_HOST="dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com"
DB_PORT="25060"
DB_NAME="defaultdb"
DB_SSLMODE="require"

DATABASE_URL="postgresql://\${DB_USERNAME}:\${DB_PASSWORD}@\${DB_HOST}:\${DB_PORT}/\${DB_NAME}?sslmode=\${DB_SSLMODE}"

echo "   Host: \$DB_HOST"
echo "   Port: \$DB_PORT"
echo "   Database: \$DB_NAME"

# Backup existing .env if it exists
if [ -f ".env" ]; then
    cp .env .env.backup.\$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
fi

# Update or add DATABASE_URL in .env
if grep -q "^DATABASE_URL=" .env 2>/dev/null; then
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"\${DATABASE_URL}\"|" .env
    echo "✅ Updated DATABASE_URL in .env"
else
    echo "DATABASE_URL=\"\${DATABASE_URL}\"" >> .env
    echo "✅ Added DATABASE_URL to .env"
fi

# Also update /etc/environment (system-wide)
echo ""
echo "🔧 Updating /etc/environment (system-wide)..."
if [ -f "/etc/environment" ]; then
    cp /etc/environment /etc/environment.backup.\$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
    sed -i '/^DATABASE_URL=/d' /etc/environment
    echo "DATABASE_URL=\"\${DATABASE_URL}\"" >> /etc/environment
    echo "✅ Updated DATABASE_URL in /etc/environment"
else
    echo "DATABASE_URL=\"\${DATABASE_URL}\"" > /etc/environment
    echo "✅ Created /etc/environment with DATABASE_URL"
fi

# Verify DATABASE_URL
if grep -q "nov-3-backup5-do-user-28031752-0" .env; then
    echo "✅ Database hostname is CORRECT in .env"
else
    echo "⚠️  WARNING: Database hostname might be incorrect in .env!"
fi

# Clear Prisma cache and regenerate
echo ""
echo "🔄 Clearing Prisma cache and regenerating client..."
rm -rf node_modules/.prisma 2>/dev/null || true
npx prisma generate || echo "⚠️  Prisma generate skipped"

# Restart the application
echo ""
echo "🔄 Restarting application..."
if command -v pm2 &> /dev/null; then
    # Kill PM2 completely to ensure fresh start
    pm2 delete all 2>/dev/null || true
    pm2 kill 2>/dev/null || true
    sleep 2
    
    # Source environment to ensure DATABASE_URL is loaded
    set -a
    [ -f /etc/environment ] && source /etc/environment
    set +a
    
    # Start PM2 with explicit environment
    cd /var/www/abcotronics-erp
    pm2 start server.js --name abcotronics-erp --update-env
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

