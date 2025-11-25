#!/bin/bash
# Restore PostgreSQL Database to DigitalOcean Managed Database (non-destructive)
# Requirements:
#   - TARGET_DATABASE_URL (or DATABASE_URL) must point to the managed database
#   - Provide the backup file path as an argument or via RESTORE_BACKUP_FILE
#   - pg_restore / psql must be installed locally

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TARGET_DATABASE_URL="${TARGET_DATABASE_URL:-${DATABASE_URL:-}}"
CLEAN_DB_URL="${TARGET_DATABASE_URL//\"/}"

if [ -z "$CLEAN_DB_URL" ]; then
    echo -e "${RED}❌ TARGET_DATABASE_URL (or DATABASE_URL) is required${NC}"
    echo "   export TARGET_DATABASE_URL=\"postgresql://user:pass@host:25060/defaultdb?sslmode=require\""
    exit 1
fi

if [[ "$CLEAN_DB_URL" != postgresql* ]]; then
    echo -e "${RED}❌ TARGET_DATABASE_URL must be a PostgreSQL connection string${NC}"
    exit 1
fi

if [ $# -gt 0 ]; then
    BACKUP_FILE="$1"
elif [ -n "${RESTORE_BACKUP_FILE:-}" ]; then
    BACKUP_FILE="$RESTORE_BACKUP_FILE"
elif ls -t backups/*.dump >/dev/null 2>&1; then
    BACKUP_FILE="$(ls -t backups/*.dump | head -n 1)"
else
    echo -e "${RED}❌ No backup file specified and none found in backups/*.dump${NC}"
    echo "   Usage: ./restore-to-digitalocean.sh backups/abcotronics-prod.dump"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}❌ Backup file not found: $BACKUP_FILE${NC}"
    exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
    echo -e "${RED}❌ pg_restore not found. Install PostgreSQL client tools first.${NC}"
    exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
    echo -e "${RED}❌ psql not found. Install PostgreSQL client tools first.${NC}"
    exit 1
fi

MASKED_INFO=$(python3 - <<'PY' "$CLEAN_DB_URL"
import sys
from urllib.parse import urlparse
url = urlparse(sys.argv[1])
user = url.username or 'unknown'
host = url.hostname or 'unknown-host'
port = url.port or 'default'
db = (url.path or '/').lstrip('/') or 'postgres'
print(f"{user}@{host}:{port}/{db}")
PY
)

echo "=========================================="
echo "PostgreSQL Database Restore to DigitalOcean"
echo "=========================================="
echo "📊 Target Database: ${MASKED_INFO}"
echo "📦 Backup File: ${BACKUP_FILE}"
echo ""

if [ -z "${FORCE_RESTORE:-}" ]; then
    if [ -t 0 ]; then
        read -p "⚠️  This will OVERWRITE the existing database. Continue? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            echo "❌ Restore cancelled"
            exit 0
        fi
    else
        echo -e "${RED}❌ Non-interactive restore blocked. Set FORCE_RESTORE=yes to continue.${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  FORCE_RESTORE detected - skipping confirmation prompt${NC}"
fi

if [ -z "${SKIP_PRE_RESTORE_BACKUP:-}" ]; then
    echo "💾 Creating safety backup before restore..."
    ORIGINAL_DB_URL="${DATABASE_URL:-}"
    export DATABASE_URL="$CLEAN_DB_URL"
    if ! ./scripts/backup-database.sh; then
        echo -e "${RED}❌ Failed to create safety backup. Aborting restore.${NC}"
        export DATABASE_URL="$ORIGINAL_DB_URL"
        exit 1
    fi
    export DATABASE_URL="$ORIGINAL_DB_URL"
    echo -e "${GREEN}✅ Safety backup created${NC}"
else
    echo -e "${YELLOW}⚠️  SKIP_PRE_RESTORE_BACKUP=1 - skipping automatic backup${NC}"
fi

echo ""
echo "🔄 Starting database restore..."
echo ""

RESTORE_LOG="$(mktemp)"
if pg_restore \
    --verbose \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --dbname="$CLEAN_DB_URL" \
    "$BACKUP_FILE" 2> >(tee "$RESTORE_LOG" >&2); then
    echo ""
    echo -e "${GREEN}✅ Database restore completed successfully!${NC}"
else
    echo ""
    echo -e "${RED}❌ Database restore failed!${NC}"
    echo "   Review $RESTORE_LOG for details."
    rm -f "$RESTORE_LOG"
    exit 1
fi

if psql "$CLEAN_DB_URL" -c "SELECT NOW();" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Database connection verified${NC}"
else
    echo -e "${YELLOW}⚠️  Could not verify database connection (continuing)${NC}"
fi

rm -f "$RESTORE_LOG"

echo ""
echo "=========================================="
echo -e "${GREEN}Restore Complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Ensure the application uses the updated DATABASE_URL."
echo "2. Run Prisma migrations safely if needed:"
echo "   ./scripts/safe-db-migration.sh \"npx prisma migrate deploy\""
echo "3. Verify the application end-to-end."
echo ""

