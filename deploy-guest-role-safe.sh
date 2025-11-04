#!/bin/bash
# Safe Deployment Script for Guest Role Feature
# Deploys code first, then runs safe database migration

set -e

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"
LOCAL_DIR="$(pwd)"

echo "🔒 Safe Deployment: Guest Role Feature"
echo "======================================"
echo ""

# Step 1: Build everything
echo "🏗️  Building project..."
npm run build
echo "✅ Build complete"
echo ""

# Step 2: Deploy via rsync (including SQL migration file)
echo "📤 Copying files to server (including safe migration script)..."
rsync -avz --progress \
  --include='add-accessible-project-ids.sql' \
  --include='migrate-guest-role-safe.sh' \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '*.log' \
  --exclude 'dist/node_modules' \
  --exclude '.DS_Store' \
  --exclude '*.md' \
  --exclude 'deploy-*.sh' \
  --exclude 'migrate-*.sh' \
  --exclude 'test-*.js' \
  --exclude 'check-*.sh' \
  --exclude 'compare-*.sh' \
  --exclude 'diagnose-*.sh' \
  --exclude 'update-*.sh' \
  --exclude 'RESTORED-DATABASE-SETUP.md' \
  "$LOCAL_DIR/" "$SERVER:$APP_DIR/"

echo "✅ Files copied"
echo ""

# Step 3: Install dependencies and generate Prisma client
echo "🔧 Installing dependencies and generating Prisma client..."
ssh $SERVER << 'DEPLOY'
set -e

cd /var/www/abcotronics-erp

echo "📦 Installing dependencies..."
npm install --production

echo "🏗️  Generating Prisma client..."
npx prisma generate || echo "⚠️  Prisma generate skipped"

echo ""
echo "✅ Code deployment complete!"
echo ""
echo "📋 Next: Run the safe migration script"
echo "   ssh root@abcoafrica.co.za"
echo "   cd /var/www/abcotronics-erp"
echo "   ./migrate-guest-role-safe.sh"
echo ""
echo "   OR run it now? (the script will prompt for confirmation)"
DEPLOY

echo ""
echo "✅ Code deployment successful!"
echo ""
echo "🔒 To complete the deployment, run the safe migration:"
echo "   ssh root@abcoafrica.co.za 'cd /var/www/abcotronics-erp && ./migrate-guest-role-safe.sh'"
echo ""
echo "   The migration script will:"
echo "   • Check if column exists before adding"
echo "   • Preserve all existing data"
echo "   • Ask for confirmation"
echo "   • Verify the migration"

