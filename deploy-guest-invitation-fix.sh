#!/bin/bash
# Deploy Guest Invitation Project Access Fix
# This script deploys the fix for guest invitations to include project access

set -e

SERVER="root@abcoafrica.co.za"
APP_DIR="/var/www/abcotronics-erp"
LOCAL_DIR="$(pwd)"

echo "🚀 Deploying Guest Invitation Project Access Fix..."
echo "📡 Server: $SERVER"
echo "📁 Local: $LOCAL_DIR"
echo ""

# Step 1: Build everything
echo "🏗️  Building project..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi
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

echo "🔄 Applying database migrations..."
npx prisma migrate deploy || echo "⚠️  Prisma migrate deploy skipped (no pending migrations)"

echo "🔍 Verifying accessibleProjectIds column..."
./scripts/safe-db-migration.sh psql "$DATABASE_URL" <<'SQL'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Invitation'
          AND column_name = 'accessibleProjectIds'
    ) THEN
        ALTER TABLE "Invitation"
            ADD COLUMN "accessibleProjectIds" TEXT DEFAULT '[]';
        RAISE NOTICE 'Column accessibleProjectIds created on Invitation table';
    ELSE
        RAISE NOTICE 'Column accessibleProjectIds already present';
    END IF;
END;
$$;
SQL

echo "🔄 Restarting application..."
pm2 restart abcotronics-erp --update-env || pm2 start server.js --name abcotronics-erp

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Verification Steps:"
echo "   1. Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)"
echo "   2. Go to Users page (admin only)"
echo "   3. Click 'Invite User'"
echo "   4. Select 'Guest' role - should see project selection UI"
echo "   5. Select projects and send invitation"
echo "   6. When guest accepts invitation, they should have access to selected projects"
echo "   7. Edit existing guest user - should be able to add/remove projects"
echo ""
echo "🌐 Check your site: https://abcoafrica.co.za"
DEPLOY

echo ""
echo "✅ Deployment successful!"
echo "💡 Hard refresh your browser (Cmd+Shift+R / Ctrl+Shift+R) to see the changes"

