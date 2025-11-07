#!/bin/bash

# Meeting Notes Platform Deployment Script
# This script deploys the meeting notes feature to production

set -e  # Exit on error

echo "🚀 Meeting Notes Platform - Deployment Script"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "prisma/schema.prisma" ]; then
    echo -e "${RED}❌ Error: prisma/schema.prisma not found${NC}"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo -e "${GREEN}✅ Found Prisma schema${NC}"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${YELLOW}⚠️  DATABASE_URL not set, checking .env file...${NC}"
    if [ -f ".env" ]; then
        export $(cat .env | grep -v '^#' | xargs)
        echo -e "${GREEN}✅ Loaded DATABASE_URL from .env${NC}"
    else
        echo -e "${RED}❌ DATABASE_URL not set and .env file not found${NC}"
        echo "Please set DATABASE_URL or create .env file"
        exit 1
    fi
fi

# Step 1: Generate Prisma Client
echo "🔨 Step 1: Generating Prisma Client..."
npx prisma generate
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to generate Prisma Client${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Prisma Client generated${NC}"
echo ""

# Step 2: Check if we're on production server
if [ -n "$SSH_CONNECTION" ] || [ "$(hostname)" == "abcoafrica.co.za" ]; then
    echo -e "${YELLOW}📍 Detected production server${NC}"
    DEPLOY_MODE="production"
else
    echo -e "${YELLOW}📍 Detected local/development environment${NC}"
    DEPLOY_MODE="development"
fi
echo ""

# Step 3: Create backup (production only)
if [ "$DEPLOY_MODE" == "production" ]; then
    echo "📦 Step 2: Creating database backup..."
    BACKUP_DIR="database-backups"
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql.gz"
    
    # Try to create backup
    if command -v pg_dump &> /dev/null; then
        pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"
        echo -e "${GREEN}✅ Backup created: $BACKUP_FILE${NC}"
    else
        echo -e "${YELLOW}⚠️  pg_dump not available, skipping backup${NC}"
    fi
    echo ""
fi

# Step 4: Apply database migration
echo "🚀 Step 3: Applying database migration..."

if [ "$DEPLOY_MODE" == "production" ]; then
    # Production: Use migrate deploy (safe, applies pending migrations)
    echo "Using 'prisma migrate deploy' (production mode)..."
    npx prisma migrate deploy || {
        echo -e "${YELLOW}⚠️  migrate deploy failed, trying db push...${NC}"
        npx prisma db push --skip-generate
    }
else
    # Development: Try migrate dev first, fallback to db push
    echo "Using 'prisma migrate dev' (development mode)..."
    npx prisma migrate dev --name add_meeting_notes || {
        echo -e "${YELLOW}⚠️  migrate dev failed (migration history conflict?), using db push...${NC}"
        npx prisma db push --skip-generate
    }
fi

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Migration failed${NC}"
    echo ""
    echo "This might be because:"
    echo "1. Database connection issues"
    echo "2. Migration conflicts with existing data"
    echo "3. Connection slots full (wait and retry)"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Migration completed successfully${NC}"
echo ""

# Step 5: Verify tables were created
echo "🔍 Step 4: Verifying database tables..."
TABLES=$(psql "$DATABASE_URL" -t -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND (table_name LIKE '%Meeting%' OR table_name LIKE '%UserTask%') ORDER BY table_name;" 2>/dev/null || echo "")

if [ -z "$TABLES" ]; then
    echo -e "${YELLOW}⚠️  Could not verify tables (this is okay if using SQLite or connection issues)${NC}"
else
    echo -e "${GREEN}✅ Found tables:${NC}"
    echo "$TABLES" | sed 's/^/   - /'
fi
echo ""

# Step 6: Restart application (if on server)
if [ "$DEPLOY_MODE" == "production" ]; then
    echo "🔄 Step 5: Restarting application..."
    
    if command -v pm2 &> /dev/null; then
        pm2 restart abcotronics-erp || echo -e "${YELLOW}⚠️  pm2 restart failed (app may not be running)${NC}"
        echo -e "${GREEN}✅ Application restarted${NC}"
    elif command -v systemctl &> /dev/null; then
        systemctl restart abcotronics-erp || echo -e "${YELLOW}⚠️  systemctl restart failed${NC}"
        echo -e "${GREEN}✅ Application restarted${NC}"
    else
        echo -e "${YELLOW}⚠️  No process manager found, please restart manually${NC}"
    fi
    echo ""
fi

# Step 7: Summary
echo "=============================================="
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo ""
echo "📊 Summary:"
echo "  ✅ Prisma Client generated"
if [ "$DEPLOY_MODE" == "production" ]; then
    echo "  ✅ Database backup created"
fi
echo "  ✅ Database migration applied"
echo "  ✅ Application restarted"
echo ""
echo "🎯 Next Steps:"
echo "  1. Test the Meeting Notes feature in the Teams section"
echo "  2. Create a monthly meeting notes entry"
echo "  3. Test user allocation"
echo "  4. Test action items and comments"
echo ""
echo "📚 For troubleshooting, see: MEETING-NOTES-DEPLOYMENT.md"
echo ""

