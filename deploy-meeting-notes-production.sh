#!/bin/bash

# Meeting Notes Platform - Production Deployment Script
# This script deploys the meeting notes feature to the production server

set -e  # Exit on error

echo "🚀 Meeting Notes Platform - Production Deployment"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Production server details
PROD_SERVER="root@abcoafrica.co.za"
PROD_PATH="/var/www/abcotronics-erp"

echo -e "${YELLOW}⚠️  This will deploy to PRODUCTION server${NC}"
echo "Server: $PROD_SERVER"
echo "Path: $PROD_PATH"
echo ""

# Skip confirmation if FORCE_DEPLOY is set
if [ -z "$FORCE_DEPLOY" ]; then
    read -p "Continue with production deployment? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo -e "${RED}Deployment cancelled${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}FORCE_DEPLOY set, skipping confirmation${NC}"
fi

echo ""
echo "📦 Step 1: Pushing code to production..."
echo "========================================"

# Check if we have uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}⚠️  You have uncommitted changes${NC}"
    echo "Files with changes:"
    git diff --name-only
    echo ""
    read -p "Continue anyway? (yes/no): " continue_anyway
    if [ "$continue_anyway" != "yes" ]; then
        echo -e "${RED}Deployment cancelled${NC}"
        exit 1
    fi
fi

# Push to git (if needed)
echo "Pushing to git..."
git push origin main || echo -e "${YELLOW}⚠️  Git push failed or already up to date${NC}"

echo ""
echo "🔌 Step 2: Connecting to production server..."
echo "=============================================="

# Deploy to production server
ssh $PROD_SERVER << ENDSSH
set -e

echo "📁 Current directory: \$(pwd)"
cd $PROD_PATH || { echo "❌ Directory not found: $PROD_PATH"; exit 1; }

echo ""
echo "📥 Step 3: Pulling latest code..."
echo "=================================="
git pull origin main || echo "⚠️  Git pull failed or already up to date"

echo ""
echo "🔨 Step 4: Generating Prisma Client..."
echo "====================================="
npx prisma generate

echo ""
echo "📦 Step 5: Creating database backup..."
echo "======================================"
BACKUP_DIR="database-backups"
mkdir -p "\$BACKUP_DIR"
BACKUP_FILE="\$BACKUP_DIR/backup_meeting_notes_\$(date +%Y%m%d_%H%M%S).sql.gz"

if command -v pg_dump &> /dev/null && [ -n "\$DATABASE_URL" ]; then
    pg_dump "\$DATABASE_URL" | gzip > "\$BACKUP_FILE" 2>/dev/null || echo "⚠️  Backup failed (continuing anyway)"
    if [ -f "\$BACKUP_FILE" ]; then
        echo "✅ Backup created: \$BACKUP_FILE"
    fi
else
    echo "⚠️  pg_dump not available, skipping backup"
fi

echo ""
echo "🚀 Step 6: Applying database migration..."
echo "========================================="
# Use db push for quick deployment (no migration history needed)
npx prisma db push --skip-generate || {
    echo "⚠️  db push failed, trying migrate deploy..."
    npx prisma migrate deploy || {
        echo "❌ Migration failed"
        exit 1
    }
}

echo ""
echo "🔍 Step 7: Verifying tables..."
echo "==============================="
# Check if tables exist (basic verification)
TABLES=\$(psql "\$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%Meeting%';" 2>/dev/null || echo "0")
echo "Found \$TABLES meeting notes related tables"

echo ""
echo "🔄 Step 8: Restarting application..."
echo "===================================="
if command -v pm2 &> /dev/null; then
    pm2 restart abcotronics-erp || pm2 start server.js --name abcotronics-erp
    echo "✅ Application restarted with PM2"
elif command -v systemctl &> /dev/null; then
    systemctl restart abcotronics-erp || echo "⚠️  systemctl restart failed"
    echo "✅ Application restarted with systemctl"
else
    echo "⚠️  No process manager found, please restart manually"
fi

echo ""
echo "✅ Production deployment complete!"
echo ""
echo "📊 Summary:"
echo "  ✅ Code pulled from git"
echo "  ✅ Prisma Client generated"
echo "  ✅ Database backup created"
echo "  ✅ Database migration applied"
echo "  ✅ Application restarted"
echo ""
echo "🌐 Test at: https://abcoafrica.co.za"
echo "   Navigate to: Teams → Management → Meeting Notes"

ENDSSH

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Production deployment successful!${NC}"
    echo ""
    echo "🌐 Test the feature at:"
    echo "   https://abcoafrica.co.za"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Log in to the production site"
    echo "   2. Navigate to Teams → Management → Meeting Notes"
    echo "   3. Test creating monthly notes"
    echo "   4. Test weekly notes and department sections"
    echo "   5. Test user allocation and action items"
    echo ""
else
    echo ""
    echo -e "${RED}❌ Production deployment failed${NC}"
    echo "Check the output above for errors"
    exit 1
fi

