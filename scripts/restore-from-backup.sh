#!/bin/bash
# Restore Database from Backup
# Usage: ./scripts/restore-from-backup.sh <backup-file>

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: Backup file required${NC}"
    echo ""
    echo "Usage: $0 <backup-file>"
    echo ""
    echo "Available backups:"
    ls -lh database-backups/ 2>/dev/null || echo "   No backups found"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}❌ Error: Backup file not found: $BACKUP_FILE${NC}"
    exit 1
fi

echo "🔄 Database Restore Tool"
echo "======================="
echo ""
echo "⚠️  WARNING: This will OVERWRITE your current database!"
echo ""
read -p "Type 'RESTORE' to confirm: " confirm

if [ "$confirm" != "RESTORE" ]; then
    echo "❌ Aborted."
    exit 1
fi

echo ""
echo "📦 Restoring from: $BACKUP_FILE"
echo ""

# Detect backup type
if [[ "$BACKUP_FILE" == *.sql.gz ]] || [[ "$BACKUP_FILE" == *.sql ]]; then
    # PostgreSQL backup
    if [ -z "$DATABASE_URL" ]; then
        echo -e "${RED}❌ Error: DATABASE_URL not set${NC}"
        exit 1
    fi
    
    echo "📊 Detected: PostgreSQL backup"
    
    if [[ "$BACKUP_FILE" == *.gz ]]; then
        echo "📦 Decompressing backup..."
        gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL"
    else
        psql "$DATABASE_URL" < "$BACKUP_FILE"
    fi
    
    echo -e "${GREEN}✅ PostgreSQL restore completed${NC}"
    
elif [[ "$BACKUP_FILE" == *.db ]]; then
    # SQLite backup
    if [ -z "$DATABASE_URL" ]; then
        echo -e "${RED}❌ Error: DATABASE_URL not set${NC}"
        exit 1
    fi
    
    DB_FILE=$(echo "$DATABASE_URL" | sed 's/file://' | sed 's/\/\///')
    
    if [ -z "$DB_FILE" ]; then
        echo -e "${RED}❌ Error: Could not determine database file path${NC}"
        exit 1
    fi
    
    echo "📊 Detected: SQLite backup"
    echo "📁 Database file: $DB_FILE"
    
    # Backup current database first
    if [ -f "$DB_FILE" ]; then
        CURRENT_BACKUP="${DB_FILE}.before-restore.$(date +%Y%m%d_%H%M%S)"
        echo "💾 Backing up current database to: $CURRENT_BACKUP"
        cp "$DB_FILE" "$CURRENT_BACKUP"
    fi
    
    # Restore
    cp "$BACKUP_FILE" "$DB_FILE"
    
    echo -e "${GREEN}✅ SQLite restore completed${NC}"
else
    echo -e "${RED}❌ Unknown backup format${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Restore completed successfully!${NC}"
echo ""
echo "📋 Next steps:"
echo "   1. Verify data: Check your application"
echo "   2. Test critical features"
echo "   3. If restore failed, check logs above"

