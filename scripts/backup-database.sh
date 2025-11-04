#!/bin/bash
# Automatic Database Backup Script
# Run this before any database operations

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "📦 Database Backup Tool"
echo "======================"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}❌ Error: DATABASE_URL environment variable not set${NC}"
    exit 1
fi

# Create backup directory
BACKUP_DIR="./database-backups"
mkdir -p "$BACKUP_DIR"

# Keep only last 10 backups
echo "🧹 Cleaning old backups (keeping last 10)..."
cd "$BACKUP_DIR"
ls -t *.sql *.db 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
cd - > /dev/null

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_${TIMESTAMP}"

# Detect database type
if [[ "$DATABASE_URL" == *"postgresql"* ]]; then
    echo "📊 Detected: PostgreSQL"
    
    if ! command -v pg_dump &> /dev/null; then
        echo -e "${RED}❌ pg_dump not found${NC}"
        echo "   Install with: brew install postgresql (macOS)"
        echo "   Or: apt-get install postgresql-client (Linux)"
        exit 1
    fi
    
    echo "💾 Creating PostgreSQL backup..."
    pg_dump "$DATABASE_URL" > "${BACKUP_FILE}.sql"
    
    # Compress backup
    gzip -f "${BACKUP_FILE}.sql"
    
    echo -e "${GREEN}✅ Backup created: ${BACKUP_FILE}.sql.gz${NC}"
    
elif [[ "$DATABASE_URL" == *"file:"* ]] || [[ "$DATABASE_URL" == *"sqlite"* ]]; then
    echo "📊 Detected: SQLite"
    
    DB_FILE=$(echo "$DATABASE_URL" | sed 's/file://' | sed 's/\/\///')
    
    if [ ! -f "$DB_FILE" ]; then
        echo -e "${YELLOW}⚠️  Database file not found: $DB_FILE${NC}"
        exit 1
    fi
    
    echo "💾 Creating SQLite backup..."
    cp "$DB_FILE" "${BACKUP_FILE}.db"
    
    echo -e "${GREEN}✅ Backup created: ${BACKUP_FILE}.db${NC}"
else
    echo -e "${RED}❌ Unknown database type${NC}"
    exit 1
fi

# Get backup size
if [ -f "${BACKUP_FILE}.sql.gz" ]; then
    SIZE=$(du -h "${BACKUP_FILE}.sql.gz" | cut -f1)
    FILE="${BACKUP_FILE}.sql.gz"
elif [ -f "${BACKUP_FILE}.db" ]; then
    SIZE=$(du -h "${BACKUP_FILE}.db" | cut -f1)
    FILE="${BACKUP_FILE}.db"
fi

echo ""
echo "📊 Backup Details:"
echo "   File: $FILE"
echo "   Size: $SIZE"
echo "   Location: $BACKUP_DIR"
echo ""
echo -e "${GREEN}✅ Backup completed successfully!${NC}"

