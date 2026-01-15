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

# If no password env vars are set, DO NOT fail deploy – just keep existing DATABASE_URL
if [ -z "\$DB_PASSWORD" ] && [ -z "\$DATABASE_PASSWORD" ]; then
    echo "⚠️  DB_PASSWORD / DATABASE_PASSWORD not set - keeping existing DATABASE_URL in .env and /etc/environment"
    echo "    (This is safe as long as the database was already configured correctly.)"
else
    # Production database credentials (ALWAYS use these)
    # Use environment variables for security - set these in your deployment environment
    DB_USERNAME="\${DB_USERNAME:-doadmin}"
    DB_PASSWORD="\${DB_PASSWORD:-\${DATABASE_PASSWORD}}"
    DB_HOST="\${DB_HOST:-dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com}"
    DB_PORT="\${DB_PORT:-25060}"
    DB_NAME="\${DB_NAME:-defaultdb}"
    DB_SSLMODE="\${DB_SSLMODE:-require}"

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

    # Remove .env.local if it exists (it overrides .env and may have wrong credentials)
    # SECURITY: .env.local should NEVER exist on production server
    echo ""
    echo "🔧 Removing .env.local if it exists (prevents override of .env)..."
    if [ -f .env.local ]; then
        echo "   ⚠️  Found .env.local - removing it to prevent override"
        rm -f .env.local
        echo "   ✅ Removed .env.local"
    else
        echo "   ✅ .env.local does not exist"
    fi

    # Verify DATABASE_URL
    if grep -q "nov-3-backup5-do-user-28031752-0" .env; then
        echo "✅ Database hostname is CORRECT in .env"
    else
        echo "⚠️  WARNING: Database hostname might be incorrect in .env!"
    fi
fi

# Run Prisma migrations via safe wrapper
echo ""
echo "🗄️  Running Prisma migrations via safe wrapper..."
if command -v npx &> /dev/null && [ -f prisma/schema.prisma ]; then
    if ! bash ./scripts/safe-db-migration.sh npx prisma migrate deploy; then
        echo "⚠️  Safe migration wrapper reported an error, continuing without further migrations"
    fi
fi

# Clear Prisma cache and regenerate
echo ""
echo "🔄 Clearing Prisma cache and regenerating client..."
rm -rf node_modules/.prisma 2>/dev/null || true
npx prisma generate || echo "⚠️  Prisma generate skipped"

# Cache busting - Clear nginx cache and add version timestamp
echo ""
echo "🔄 Clearing caches for cache busting..."
# Clear nginx cache if it exists
if [ -d /var/cache/nginx ]; then
    rm -rf /var/cache/nginx/* 2>/dev/null || true
    echo "✅ Nginx cache cleared"
fi

# Add cache-busting version file
CACHE_BUST_VERSION=$(date +%s)
echo "$CACHE_BUST_VERSION" > /var/www/abcotronics-erp/.cache-version 2>/dev/null || true
echo "✅ Cache version set to: $CACHE_BUST_VERSION"

# Reload nginx to clear any in-memory cache
if command -v nginx &> /dev/null; then
    nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || echo "⚠️  Nginx reload skipped"
    echo "✅ Nginx reloaded"
fi

# Restart the application
echo ""
echo "🔄 Restarting application..."
if command -v pm2 &> /dev/null; then
    # Source environment to ensure DATABASE_URL is loaded
    set -a
    [ -f /etc/environment ] && source /etc/environment
    set +a
    
    # Set cache-busting version and build time
    export APP_BUILD_TIME=\$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    export APP_VERSION=\$(git rev-parse --short HEAD 2>/dev/null || echo "\$(date +%s)")
    echo "📦 Cache-busting version: \$APP_VERSION"
    echo "📦 Build time: \$APP_BUILD_TIME"
    
    # Update .env with cache-busting version
    if [ -f /var/www/abcotronics-erp/.env ]; then
        # Remove old APP_VERSION and APP_BUILD_TIME if they exist
        sed -i '/^APP_VERSION=/d' /var/www/abcotronics-erp/.env
        sed -i '/^APP_BUILD_TIME=/d' /var/www/abcotronics-erp/.env
        # Add new ones
        echo "APP_VERSION=\$APP_VERSION" >> /var/www/abcotronics-erp/.env
        echo "APP_BUILD_TIME=\$APP_BUILD_TIME" >> /var/www/abcotronics-erp/.env
        echo "✅ Updated .env with cache-busting version"
    fi
    
    # Start PM2 with explicit environment including cache-busting vars
    cd /var/www/abcotronics-erp
    pm2 restart abcotronics-erp --update-env || pm2 start server.js --name abcotronics-erp --update-env --env production
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

