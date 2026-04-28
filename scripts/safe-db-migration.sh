#!/bin/bash
# Safe Database Migration Script with Automatic Backups
# This script prevents accidental data loss

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-14}"

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

# Helper to terminate idle PostgreSQL connections when slot limit is reached
cleanup_postgres_connections() {
    if [ "$DB_TYPE" != "postgresql" ]; then
        return 0
    fi

    if ! command -v psql &> /dev/null; then
        echo -e "${YELLOW}⚠️  psql not available; skipping automatic connection cleanup${NC}"
        return 1
    fi

    local CLEAN_URL="${DATABASE_URL//\"/}"
    if [ -z "$CLEAN_URL" ]; then
        echo -e "${YELLOW}⚠️  DATABASE_URL missing; skipping automatic connection cleanup${NC}"
        return 1
    fi

    echo "   Attempting to terminate idle PostgreSQL connections..."
    if psql "$CLEAN_URL" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();" >/dev/null; then
        echo "   ✅ Idle connections terminated (if any)."
        return 0
    else
        echo -e "${YELLOW}⚠️  Unable to terminate connections automatically${NC}"
        return 1
    fi
}

# Create backup directory
BACKUP_DIR="./database-backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_${TIMESTAMP}"

prune_old_backups() {
    local retention="$1"
    if ! [[ "$retention" =~ ^[0-9]+$ ]] || [ "$retention" -lt 1 ]; then
        echo -e "${YELLOW}⚠️  Invalid BACKUP_RETENTION_COUNT='${retention}', skipping backup prune${NC}"
        return 0
    fi

    # Keep newest N backups across sql/sql.gz/db; remove older files to cap growth.
    local pattern
    pattern=$(ls -1t "$BACKUP_DIR"/backup_* 2>/dev/null || true)
    if [ -z "$pattern" ]; then
        return 0
    fi

    local delete_list
    delete_list=$(printf "%s\n" "$pattern" | tail -n +"$((retention + 1))" || true)
    if [ -z "$delete_list" ]; then
        return 0
    fi

    echo "🧹 Pruning old backups (keeping latest ${retention})..."
    printf "%s\n" "$delete_list" | while IFS= read -r old_file; do
        [ -n "$old_file" ] || continue
        rm -f "$old_file" || true
    done
}

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
        
        # Ask for confirmation to continue without backup (skip in non-interactive/deploy)
        if [ -n "${NON_INTERACTIVE:-}" ] || [ -n "${CI:-}" ]; then
            echo "   Non-interactive mode: proceeding without backup"
        else
            read -p "⚠️  Continue without backup? (type 'YES' to continue): " confirm
            if [ "$confirm" != "YES" ]; then
                echo "❌ Aborted. Backup is required for safety."
                exit 1
            fi
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

prune_old_backups "$BACKUP_RETENTION_COUNT"

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
    if [ -n "${NON_INTERACTIVE:-}" ] || [ -n "${CI:-}" ]; then
        echo "   Non-interactive mode: proceeding (use with caution)"
    else
        read -p "⚠️  Continue with --accept-data-loss? (type 'ACCEPT' to continue): " confirm
        if [ "$confirm" != "ACCEPT" ]; then
            echo "❌ Aborted."
            exit 1
        fi
    fi
    echo ""
fi

# Run the migration
echo "🚀 Running migration..."
echo "   Command: $@"
echo ""

MAX_ATTEMPTS=5
SLEEP_SECONDS=20
ATTEMPT=1
MIGRATION_EXIT_CODE=1

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    echo "   Attempt $ATTEMPT of $MAX_ATTEMPTS..."
    ERR_LOG="$(mktemp)"

    if "$@" 2> >(tee "$ERR_LOG" >&2); then
        MIGRATION_EXIT_CODE=0
        rm -f "$ERR_LOG"
        break
    fi

    MIGRATION_EXIT_CODE=$?
    ERROR_OUTPUT="$(cat "$ERR_LOG")"
    rm -f "$ERR_LOG"

    if echo "$ERROR_OUTPUT" | grep -qi "remaining connection slots are reserved for roles with the superuser attribute"; then
        if [ $ATTEMPT -lt $MAX_ATTEMPTS ]; then
            echo -e "${YELLOW}⚠️  Connection slot limit hit. Retrying in ${SLEEP_SECONDS}s...${NC}"
            cleanup_postgres_connections || true
            sleep $SLEEP_SECONDS
            ATTEMPT=$((ATTEMPT + 1))
            continue
        fi
    fi

    # Any other failure (or max attempts reached)
    break
done

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

