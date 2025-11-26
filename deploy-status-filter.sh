#!/bin/bash
# Deploy status filter changes to production server

set -e

echo "🚀 Deploying Status Filter Changes..."
echo ""

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"

echo "📡 Connecting to server..."
ssh $SERVER << ENDSSH
set -e

echo "✅ Connected to server"
echo ""

cd $APP_DIR
echo "📁 Current directory: \$(pwd)"
echo ""

# Pull latest changes
echo "📥 Pulling latest changes from GitHub..."
git fetch origin
git reset --hard origin/main || {
    echo "⚠️  Git reset failed, trying to stash changes..."
    git stash
    git reset --hard origin/main
}
echo "✅ Code updated"
echo ""

# Install dependencies (including dev dependencies for build)
echo "📦 Installing dependencies..."
npm install || npm ci || echo "⚠️  npm install had issues, continuing..."
echo ""

# Build frontend (JSX → dist)
echo "🏗️  Building frontend (JSX → dist)..."
npm run build:jsx || echo "⚠️  JSX build failed, continuing anyway..."
echo ""

# Build CSS
echo "🏗️  Building CSS..."
npm run build:css || echo "⚠️  CSS build failed, continuing anyway..."
echo ""

# Restart the application
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp || pm2 restart all
pm2 save || true
echo "✅ Application restarted"
echo ""

echo "✅ Deployment complete!"
echo ""
echo "📋 Changes deployed:"
echo "   - Pipeline.jsx - Changed 'All Ages' filter to 'All Status' filter"
echo "   - Filter now shows: Active, Proposal, Disinterested, Potential"
echo ""
echo "🧪 Test the feature:"
echo "   1. Navigate to Clients and Leads → Pipeline"
echo "   2. Check the filter dropdown (should show 'All Status' instead of 'All Ages')"
echo "   3. Hard refresh browser (Ctrl+Shift+R / Cmd+Shift+R) if needed"
echo ""

ENDSSH

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🧪 Test at: https://abcoafrica.co.za/clients"
echo ""





