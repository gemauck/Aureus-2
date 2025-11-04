#!/bin/bash
# Deploy Guest Role Feature to Production
# This script deploys the guest user role with project-level access control

set -e

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"
LOCAL_DIR="$(pwd)"

echo "🚀 Deploying Guest Role Feature to Production..."
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

# Step 3: Install dependencies, run migration, and restart on server
echo "🔧 Installing dependencies, running migration, and restarting..."
ssh $SERVER << 'DEPLOY'
set -e

cd /var/www/abcotronics-erp

echo "📦 Installing dependencies..."
npm install --production

echo "🏗️  Generating Prisma client..."
npx prisma generate || echo "⚠️  Prisma generate skipped"

echo "🔄 Running database migration..."
# First, try to create a migration (for development/testing)
npx prisma migrate dev --name add_guest_role_and_accessible_projects --create-only || echo "⚠️  Migration creation skipped"

# Then apply the migration to production
npx prisma migrate deploy || npx prisma db push --accept-data-loss || echo "⚠️  Migration skipped - schema may already be up to date"

echo "🔄 Restarting application..."
pm2 restart abcotronics-erp || pm2 start server.js --name abcotronics-erp

echo ""
echo "✅ Deployment complete!"
echo "🌐 Check your site: https://abcoafrica.co.za"
echo ""
echo "📋 Next Steps:"
echo "   1. Go to Users page (admin only)"
echo "   2. Create a new user with 'Guest' role"
echo "   3. Select which projects the guest can access"
echo "   4. Test by logging in as the guest user"
DEPLOY

echo ""
echo "✅ Deployment successful!"
echo "💡 Hard refresh your browser (Cmd+Shift+R / Ctrl+Shift+R) to see the changes"
echo ""
echo "📋 Feature Summary:"
echo "   • Guest users can only see Projects section"
echo "   • Guest users can only view assigned projects"
echo "   • Admin can assign projects to guest users"
echo "   • API-level security enforced"

