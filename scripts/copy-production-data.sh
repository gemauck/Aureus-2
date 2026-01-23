#!/bin/bash
# Copy Production Database to Local
# This script dumps the production database and restores it locally

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📥 Copying production database to local...${NC}"
echo ""

# Configuration
PROD_SERVER="root@165.22.127.196"
PROD_APP_DIR="/var/www/abcotronics-erp"
DB_NAME="abcotronics_erp_local"
DB_USER="${USER}"
LOCAL_DB_PORT="5437"
LOCAL_DB_URL="postgresql://${DB_USER}@localhost:${LOCAL_DB_PORT}/${DB_NAME}"

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo -e "${RED}❌ .env.local not found${NC}"
    echo "Please run ./scripts/setup-local-dev.sh first"
    exit 1
fi

# Check if local database exists
if ! psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${DB_NAME}"; then
    echo -e "${RED}❌ Local database '${DB_NAME}' not found${NC}"
    echo "Please run ./scripts/setup-local-dev.sh first"
    exit 1
fi

echo "This will:"
echo "  1. Connect to production server: ${PROD_SERVER}"
echo "  2. Dump the production database"
echo "  3. Restore it to your local database: ${DB_NAME}"
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled"
    exit 0
fi

# Method 1: Try to get DATABASE_URL from production server
echo ""
echo -e "${BLUE}📡 Connecting to production server...${NC}"

# Try to get production DATABASE_URL
PROD_DB_URL=$(ssh ${PROD_SERVER} "cd ${PROD_APP_DIR} && grep '^DATABASE_URL=' .env | cut -d '=' -f2- | tr -d '\"'" 2>/dev/null || echo "")

if [ -z "$PROD_DB_URL" ]; then
    echo -e "${YELLOW}⚠️  Could not get DATABASE_URL from production server${NC}"
    echo ""
    echo "Please provide the production DATABASE_URL manually:"
    echo "  Format: postgresql://user:password@host:port/database?sslmode=require"
    read -p "DATABASE_URL: " PROD_DB_URL
    
    if [ -z "$PROD_DB_URL" ]; then
        echo -e "${RED}❌ DATABASE_URL is required${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Got production DATABASE_URL${NC}"
fi

# Extract database name from URL
PROD_DB_NAME=$(echo "$PROD_DB_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')

echo ""
echo -e "${BLUE}📦 Dumping production database...${NC}"

# Create temporary dump file
DUMP_FILE="/tmp/abcotronics_prod_dump_$(date +%Y%m%d_%H%M%S).sql"

# Dump production database
# Extract password from URL for PGPASSWORD environment variable
# Format: postgresql://user:password@host:port/database
PROD_PASSWORD=$(echo "$PROD_DB_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')

echo "Dumping production database..."
export PGPASSWORD="$PROD_PASSWORD"
pg_dump "$PROD_DB_URL" > "$DUMP_FILE" 2>&1 || {
    echo -e "${YELLOW}⚠️  Direct connection failed, trying via SSH...${NC}"
    
    # Alternative: Dump via SSH if direct connection fails
    ssh ${PROD_SERVER} "cd ${PROD_APP_DIR} && source .env 2>/dev/null || true && pg_dump \"\$DATABASE_URL\"" > "$DUMP_FILE" 2>&1 || {
        echo -e "${RED}❌ Failed to dump production database${NC}"
        echo ""
        echo "Please ensure:"
        echo "  1. You have SSH access to ${PROD_SERVER}"
        echo "  2. PostgreSQL client tools (pg_dump) are installed locally"
        echo "  3. The production database is accessible from your network"
        echo "  4. Your IP is whitelisted in Digital Ocean database firewall"
        echo ""
        echo "You can also manually dump the database:"
        echo "  ssh ${PROD_SERVER} 'cd ${PROD_APP_DIR} && pg_dump \$DATABASE_URL > /tmp/dump.sql'"
        echo "  scp ${PROD_SERVER}:/tmp/dump.sql /tmp/abcotronics_prod_dump.sql"
        echo "  psql ${LOCAL_DB_URL} < /tmp/abcotronics_prod_dump.sql"
        rm -f "$DUMP_FILE"
        unset PGPASSWORD
        exit 1
    }
}
unset PGPASSWORD

if [ ! -s "$DUMP_FILE" ]; then
    echo -e "${RED}❌ Dump file is empty${NC}"
    rm -f "$DUMP_FILE"
    exit 1
fi

echo -e "${GREEN}✅ Production database dumped (${DUMP_FILE})${NC}"

# Restore to local database
echo ""
echo -e "${BLUE}📤 Restoring to local database...${NC}"

# Drop all existing connections to the local database
psql -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" 2>/dev/null || \
psql -U postgres -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" 2>/dev/null || true

# Restore the dump
psql "$LOCAL_DB_URL" < "$DUMP_FILE" 2>&1 | grep -v "ERROR:" || {
    echo -e "${YELLOW}⚠️  Some errors occurred during restore (this may be normal)${NC}"
}

echo -e "${GREEN}✅ Database restored${NC}"

# Clean up dump file
rm -f "$DUMP_FILE"

# Run Prisma generate to ensure client is up to date
echo ""
echo -e "${BLUE}🔄 Updating Prisma client...${NC}"
npx prisma generate

echo ""
echo -e "${GREEN}✅ Production data copied to local database!${NC}"
echo ""
echo "Your local database now contains production data."
echo "Start the local server with: npm run dev"
echo ""

