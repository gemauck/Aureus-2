#!/bin/bash
# Complete deployment to DigitalOcean droplet
# Deploys code and updates nginx configuration

set -e

DROPLET_IP="165.22.127.196"
DOMAIN="abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"
APP_PORT="3000"

echo "🚀 Deploying to DigitalOcean Droplet"
echo "======================================"
echo "IP: $DROPLET_IP"
echo "Domain: $DOMAIN"
echo ""

# Step 1: Upload nginx fix script to server
echo "📤 Step 1: Uploading nginx fix script..."
scp deploy-http2-jsx-fix.sh root@$DROPLET_IP:/root/
echo "✅ Script uploaded"

# Step 2: Deploy code and update nginx
echo ""
echo "📡 Step 2: Connecting to droplet and deploying..."
ssh root@$DROPLET_IP << ENDSSH
set -e

echo "✅ Connected to droplet"
echo ""

# Navigate to app directory
cd $APP_DIR
echo "📁 Current directory: \$(pwd)"
echo ""

# Pull latest changes
echo "📥 Pulling latest changes from GitHub..."
git fetch origin main
if git reset --hard origin/main; then
    echo "✅ Code updated successfully"
else
    echo "⚠️  Git reset failed, trying alternative approach..."
    git stash || true
    git fetch origin main
    git reset --hard origin/main
    echo "✅ Code updated after reset"
fi

# CRITICAL: Always set correct DATABASE_URL after git pull
echo ""
echo "🔧 Ensuring correct DATABASE_URL is set..."

# First, try to use existing DATABASE_URL from .env file
if [ -f .env ] && grep -q "^DATABASE_URL=" .env 2>/dev/null; then
    EXISTING_DB_URL=$(grep "^DATABASE_URL=" .env | sed 's/^DATABASE_URL=//' | sed 's/^"//' | sed 's/"$//' | sed "s/^'//" | sed "s/'$//")
    if [ -n "$EXISTING_DB_URL" ] && [ "$EXISTING_DB_URL" != "" ]; then
        echo "✅ Using existing DATABASE_URL from .env file"
        export DATABASE_URL="$EXISTING_DB_URL"
        # Also update /etc/environment if it exists
        if [ -f /etc/environment ]; then
            sed -i '/^DATABASE_URL=/d' /etc/environment
            echo "DATABASE_URL=\"$EXISTING_DB_URL\"" >> /etc/environment
        fi
    else
        echo "⚠️  DATABASE_URL in .env is empty, will try to set from environment variables"
        # Fall through to setting from env vars
    fi
fi

# If DATABASE_URL is not set yet, try to set it from environment variables
if [ -z "$DATABASE_URL" ]; then
    # Use environment variables for security - set these in your deployment environment
    DB_USERNAME="${DB_USERNAME:-doadmin}"
    DB_PASSWORD="${DB_PASSWORD:-${DATABASE_PASSWORD}}"
    DB_HOST="${DB_HOST:-dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com}"
    DB_PORT="${DB_PORT:-25060}"
    DB_NAME="${DB_NAME:-defaultdb}"
    DB_SSLMODE="${DB_SSLMODE:-require}"
    
    if [ -z "$DB_PASSWORD" ]; then
        echo "⚠️  WARNING: DB_PASSWORD not provided, but existing DATABASE_URL will be preserved if present"
        echo "   If DATABASE_URL is missing, you'll need to set it manually"
    else
        CORRECT_DATABASE_URL="postgresql://\${DB_USERNAME}:\${DB_PASSWORD}@\${DB_HOST}:\${DB_PORT}/\${DB_NAME}?sslmode=\${DB_SSLMODE}"
        
        # Update .env
        if grep -q "^DATABASE_URL=" .env 2>/dev/null; then
            sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"\${CORRECT_DATABASE_URL}\"|" .env
        else
            echo "DATABASE_URL=\"\${CORRECT_DATABASE_URL}\"" >> .env
        fi
        
        # Update /etc/environment
        if [ -f /etc/environment ]; then
            sed -i '/^DATABASE_URL=/d' /etc/environment
            echo "DATABASE_URL=\"\${CORRECT_DATABASE_URL}\"" >> /etc/environment
        fi
        
        export DATABASE_URL="\${CORRECT_DATABASE_URL}"
        echo "✅ DATABASE_URL set to correct production database"
    fi
fi

echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "🏗️  Building JSX files..."
npm run build:jsx || echo "⚠️ JSX build had warnings but continuing..."

# CRITICAL: Build RichTextEditor separately to ensure cursor fix v9 is deployed
echo ""
echo "🔧 Building RichTextEditor separately (cursor fix v9)..."
node -e "const esbuild = require('esbuild'); esbuild.build({entryPoints: ['src/components/common/RichTextEditor.jsx'], bundle: false, format: 'iife', jsx: 'transform', jsxFactory: 'React.createElement', outdir: 'dist/src', write: true, minify: false}).then(() => console.log('✅ RichTextEditor v9 built successfully')).catch(e => console.error('❌ RichTextEditor build error:', e.message))" || echo "⚠️ RichTextEditor build had issues but continuing..."

echo ""
echo "🎨 Building CSS..."
npm run build:css || echo "⚠️ CSS build had warnings but continuing..."

echo ""
echo "🏗️  Building Vite Projects module..."
npm run build:vite-projects || echo "⚠️ Vite projects build had warnings but continuing..."

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
echo "🔧 Generating Prisma client..."
npx prisma generate || echo "⚠️ Prisma generate had warnings but continuing..."

echo ""
echo "🔄 Restarting application..."

# Try PM2 first
if command -v pm2 &> /dev/null; then
    echo "   Using PM2..."
    echo "   Clearing Prisma cache..."
    rm -rf node_modules/.prisma 2>/dev/null || true
    npx prisma generate || echo "⚠️  Prisma generate skipped"
    
    # Use pm2 restart which is safer than delete/start
    set -a
    [ -f /etc/environment ] && source /etc/environment
    set +a
    cd /var/www/abcotronics-erp
    pm2 restart abcotronics-erp --update-env || pm2 start server.js --name abcotronics-erp --update-env
    pm2 save
    echo "   ✅ Application restarted with PM2"
# Try systemctl
elif systemctl list-units --type=service | grep -q abcotronics; then
    echo "   Using systemctl..."
    systemctl restart abcotronics-erp
    echo "   ✅ Application restarted with systemctl"
# Try manual restart
else
    echo "   ⚠️  No process manager found, you may need to restart manually"
    echo "   Run: node server.js (or use pm2/systemctl)"
fi

echo ""
echo "🔧 Step 3: Updating nginx configuration..."
if [ -f /root/deploy-http2-jsx-fix.sh ]; then
    chmod +x /root/deploy-http2-jsx-fix.sh
    /root/deploy-http2-jsx-fix.sh
else
    echo "   ⚠️  Nginx fix script not found at /root/deploy-http2-jsx-fix.sh"
    echo "   You can run it manually after deployment"
fi

echo ""
echo "========================================="
echo "✅ Deployment complete!"
echo "========================================="
echo ""
echo "📋 Verification:"
echo "   1. Check app status: pm2 status"
echo "   2. Check nginx: systemctl status nginx"
echo "   3. Test site: curl -I https://$DOMAIN"
echo ""

ENDSSH

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🧪 Test your deployment:"
echo "   1. Visit: https://$DOMAIN"
echo "   2. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)"
echo "   3. Check console for: '✅ App mounted successfully'"
echo ""
echo "📊 Monitor logs:"
echo "   ssh root@$DROPLET_IP 'pm2 logs abcotronics-erp'"
echo "   ssh root@$DROPLET_IP 'tail -f /var/log/nginx/error.log'"
echo ""

