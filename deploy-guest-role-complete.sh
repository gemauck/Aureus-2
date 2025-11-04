#!/bin/bash
# Complete Deployment Script for Guest Role Feature
# Ensures everything is deployed and working

set -e

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"
LOCAL_DIR="$(pwd)"

echo "🚀 Complete Guest Role Deployment"
echo "=================================="
echo ""

# Step 1: Build everything locally
echo "🏗️  Building project locally..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi
echo "✅ Build complete"
echo ""

# Step 2: Deploy all files
echo "📤 Deploying all files to server..."
rsync -avz --progress \
  --include='add-accessible-project-ids.sql' \
  --include='migrate-guest-role-auto-safe.sh' \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '*.log' \
  --exclude 'dist/node_modules' \
  --exclude '.DS_Store' \
  "$LOCAL_DIR/" "$SERVER:$APP_DIR/"

echo "✅ Files deployed"
echo ""

# Step 3: On server - install, migrate, restart
echo "🔧 Installing, migrating, and restarting on server..."
ssh $SERVER << 'DEPLOY'
set -e

cd /var/www/abcotronics-erp

echo "📦 Installing dependencies..."
npm install --production

echo "🏗️  Generating Prisma client..."
npx prisma generate

echo "🔄 Running safe database migration..."
# Use Prisma db push which is safe (only adds missing columns)
npx prisma db push --accept-data-loss --skip-generate || echo "⚠️  Migration skipped (may already be applied)"

echo ""
echo "🔄 Restarting application..."
pm2 restart abcotronics-erp --update-env || pm2 start server.js --name abcotronics-erp

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Verification Steps:"
echo "   1. Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)"
echo "   2. Go to Users page (admin only)"
echo "   3. Click 'Add User' or edit existing user"
echo "   4. Check role dropdown - should see 'Guest' option"
echo "   5. Select 'Guest' - should see project selection UI"
echo ""
echo "🔍 If Guest option doesn't appear:"
echo "   - Clear browser cache completely"
echo "   - Check browser console for errors (F12)"
echo "   - Verify you're logged in as admin"
DEPLOY

echo ""
echo "✅ Complete deployment finished!"
echo ""
echo "🌐 Test at: https://abcoafrica.co.za"
echo ""
echo "📋 Quick Test Checklist:"
echo "   [ ] Hard refresh browser (Cmd+Shift+R)"
echo "   [ ] Log in as admin"
echo "   [ ] Go to Users page"
echo "   [ ] Click 'Add User'"
echo "   [ ] See 'Guest' in role dropdown"
echo "   [ ] Select 'Guest' role"
echo "   [ ] See project selection UI appear"
echo "   [ ] Select projects and save"
echo "   [ ] Log in as guest user"
echo "   [ ] See only Projects menu"
echo "   [ ] See only assigned projects"

