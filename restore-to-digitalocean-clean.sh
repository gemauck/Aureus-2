#!/bin/bash
# Clean restore to DigitalOcean PostgreSQL
# - Drops the public schema before restoring
# - Requires TARGET_DATABASE_URL (or DATABASE_URL) and pg_restore/psql binaries

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
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}❌ Backup file not found: $BACKUP_FILE${NC}"
    exit 1
fi

for bin in pg_restore psql; do
    if ! command -v "$bin" >/dev/null 2>&1; then
        echo -e "${RED}❌ $bin not found. Install PostgreSQL client tools first.${NC}"
        exit 1
    fi
done

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
echo "Clean PostgreSQL Restore to DigitalOcean"
echo "=========================================="
echo "📊 Target Database: ${MASKED_INFO}"
echo "📦 Backup File: ${BACKUP_FILE}"
echo ""

if [ -z "${FORCE_RESTORE:-}" ]; then
    if [ -t 0 ]; then
        read -p "⚠️  This will DROP ALL TABLES and restore from backup. Continue? (yes/no): " confirm
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
    echo "💾 Creating safety backup before destructive restore..."
    ORIGINAL_DB_URL="${DATABASE_URL:-}"
    export DATABASE_URL="$CLEAN_DB_URL"
    if ! ./scripts/backup-database.sh; then
        echo -e "${RED}❌ Failed to create safety backup. Aborting restore.${NC}"
        export DATABASE_URL="$ORIGINAL_DB_URL"
        exit 1
    fi
    export DATABASE_URL="$ORIGINAL_DB_URL"
    echo -e "${GREEN}✅ Safety backup completed${NC}"
else
    echo -e "${YELLOW}⚠️  SKIP_PRE_RESTORE_BACKUP=1 - skipping automatic backup${NC}"
fi

echo ""
echo "🗑️  Dropping public schema..."
psql "$CLEAN_DB_URL" <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO CURRENT_USER;
GRANT ALL ON SCHEMA public TO public;
SQL
echo -e "${GREEN}✅ Public schema recreated${NC}"
echo ""

echo "📦 Restoring database from dump file..."
RESTORE_LOG="$(mktemp)"
if pg_restore \
    --verbose \
    --no-owner \
    --no-privileges \
    --dbname="$CLEAN_DB_URL" \
    "$BACKUP_FILE" 2> >(tee "$RESTORE_LOG" >&2); then
    echo -e "${GREEN}✅ Database restore completed${NC}"
else
    echo -e "${RED}❌ Database restore failed. See $RESTORE_LOG for details${NC}"
    rm -f "$RESTORE_LOG"
    exit 1
fi

echo ""
echo "🧪 Verifying restore..."
TABLE_COUNT=$(psql "$CLEAN_DB_URL" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d '[:space:]')
if [ -n "$TABLE_COUNT" ] && [ "$TABLE_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ Restore verified: $TABLE_COUNT tables present${NC}"
else
    echo -e "${YELLOW}⚠️  Could not verify table count${NC}"
fi

rm -f "$RESTORE_LOG"

echo ""
echo "=========================================="
echo -e "${GREEN}Clean Restore Complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Confirm the application uses the correct DATABASE_URL."
echo "2. Apply pending Prisma schema changes safely (if any):"
echo "   ./scripts/safe-db-migration.sh \"npx prisma migrate deploy\""
echo "3. Smoke-test the application."
echo ""

