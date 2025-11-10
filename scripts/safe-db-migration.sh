#!/bin/bash
# Safe Database Migration Script with Automatic Backups
# This script prevents accidental data loss

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "🔒 Safe Database Migration Tool"
echo "================================"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}❌ Error: DATABASE_URL environment variable not set${NC}"
    exit 1
fi

# Detect database type from URL
if [[ "$DATABASE_URL" == *"postgresql"* ]]; then
    DB_TYPE="postgresql"
    DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
elif [[ "$DATABASE_URL" == *"file:"* ]] || [[ "$DATABASE_URL" == *"sqlite"* ]]; then
    DB_TYPE="sqlite"
    DB_FILE=$(echo "$DATABASE_URL" | sed 's/file://' | sed 's/\/\///')
else
    DB_TYPE="unknown"
fi

echo "📊 Database Type: $DB_TYPE"
echo ""

# Create backup directory
BACKUP_DIR="./database-backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_${TIMESTAMP}"

echo "📦 Creating backup before migration..."

if [ "$DB_TYPE" = "postgresql" ]; then
    # PostgreSQL backup
    if command -v pg_dump &> /dev/null; then
        echo "   Creating PostgreSQL backup..."
        BACKUP_STDERR="$(mktemp)"
        if pg_dump "$DATABASE_URL" > "${BACKUP_FILE}.sql" 2> "$BACKUP_STDERR"; then
            echo -e "${GREEN}✅ Backup created: ${BACKUP_FILE}.sql${NC}"
            rm -f "$BACKUP_STDERR"
        else
            BACKUP_ERROR="$(cat "$BACKUP_STDERR")"
            rm -f "$BACKUP_STDERR" "${BACKUP_FILE}.sql"
            if echo "$BACKUP_ERROR" | grep -qi "remaining connection slots are reserved for roles with the superuser attribute"; then
                echo -e "${YELLOW}⚠️  Backup skipped: $BACKUP_ERROR${NC}"
                echo -e "${YELLOW}⚠️  Proceeding without backup due to connection slot limits${NC}"
            else
                echo -e "${RED}❌ Backup failed:${NC}"
                echo "$BACKUP_ERROR"
                echo ""
                echo "Aborting to avoid running migration without a backup."
                exit 1
            fi
        fi
    else
        echo -e "${YELLOW}⚠️  pg_dump not found. Skipping backup (not recommended)${NC}"
        echo "   Install with: brew install postgresql (macOS) or apt-get install postgresql-client (Linux)"
        
        # Ask for confirmation to continue without backup
        read -p "⚠️  Continue without backup? (type 'YES' to continue): " confirm
        if [ "$confirm" != "YES" ]; then
            echo "❌ Aborted. Backup is required for safety."
            exit 1
        fi
    fi
elif [ "$DB_TYPE" = "sqlite" ]; then
    # SQLite backup
    if [ -f "$DB_FILE" ]; then
        echo "   Creating SQLite backup..."
        cp "$DB_FILE" "${BACKUP_FILE}.db"
        echo -e "${GREEN}✅ Backup created: ${BACKUP_FILE}.db${NC}"
    else
        echo -e "${YELLOW}⚠️  Database file not found: $DB_FILE${NC}"
    fi
fi

echo ""
echo "🔍 Checking for dangerous flags..."

# Check command line arguments for dangerous flags
DANGEROUS_FLAGS=("--force-reset" "--force" "--skip-seed" "migrate reset")
FOUND_DANGEROUS=false

for flag in "$@"; do
    for dangerous in "${DANGEROUS_FLAGS[@]}"; do
        if [[ "$flag" == *"$dangerous"* ]]; then
            echo -e "${RED}❌ DANGEROUS FLAG DETECTED: $flag${NC}"
            echo -e "${RED}   This flag can DELETE ALL DATA!${NC}"
            FOUND_DANGEROUS=true
        fi
    done
done

if [ "$FOUND_DANGEROUS" = true ]; then
    echo ""
    echo -e "${RED}⚠️  BLOCKED: Dangerous flags detected${NC}"
    echo ""
    echo "The following flags are NOT allowed:"
    echo "  - --force-reset (DELETES ALL DATA)"
    echo "  - --force (Can cause data loss)"
    echo "  - migrate reset (DELETES ALL DATA)"
    echo ""
    echo "If you REALLY need to reset the database:"
    echo "  1. Use the restore script: ./restore-db-to-10pm.sh"
    echo "  2. Or manually restore from backup: ${BACKUP_FILE}"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ No dangerous flags detected${NC}"
echo ""

# Check if --accept-data-loss is present
if [[ "$*" == *"--accept-data-loss"* ]]; then
    echo -e "${YELLOW}⚠️  WARNING: --accept-data-loss flag detected${NC}"
    echo "   This can cause data loss if schema changes conflict"
    echo ""
    read -p "⚠️  Continue with --accept-data-loss? (type 'ACCEPT' to continue): " confirm
    if [ "$confirm" != "ACCEPT" ]; then
        echo "❌ Aborted."
        exit 1
    fi
    echo ""
fi

# Run the migration
echo "🚀 Running migration..."
echo "   Command: $@"
echo ""

# Execute the command passed to this script
exec "$@"

MIGRATION_EXIT_CODE=$?

if [ $MIGRATION_EXIT_CODE -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Migration completed successfully${NC}"
    echo ""
    echo "📦 Backup location: ${BACKUP_FILE}"
    echo "   Keep this backup until you've verified the migration worked correctly"
else
    echo ""
    echo -e "${RED}❌ Migration failed with exit code: $MIGRATION_EXIT_CODE${NC}"
    echo ""
    echo "💡 To restore from backup:"
    if [ "$DB_TYPE" = "postgresql" ]; then
        echo "   psql \$DATABASE_URL < ${BACKUP_FILE}.sql"
    elif [ "$DB_TYPE" = "sqlite" ]; then
        echo "   cp ${BACKUP_FILE}.db $DB_FILE"
    fi
    exit $MIGRATION_EXIT_CODE
fi

