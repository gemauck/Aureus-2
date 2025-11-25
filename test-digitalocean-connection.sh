#!/bin/bash
# Test connection to DigitalOcean Database
# This script verifies connectivity before attempting a restore

set -e

# Database connection string (set TARGET_DATABASE_URL or DATABASE_URL before running)
TARGET_DATABASE_URL="${TARGET_DATABASE_URL:-${DATABASE_URL:-}}"
CLEAN_DB_URL="${TARGET_DATABASE_URL//\"/}"

if [ -z "$CLEAN_DB_URL" ]; then
    echo "❌ TARGET_DATABASE_URL (or DATABASE_URL) is required"
    echo "   export TARGET_DATABASE_URL=\"postgresql://doadmin:<DIGITALOCEAN_DB_PASSWORD>@db-host:25060/defaultdb?sslmode=require\""
    exit 1
fi

if [[ "$CLEAN_DB_URL" != postgresql* ]]; then
    echo "❌ TARGET_DATABASE_URL must be a PostgreSQL connection string"
    exit 1
fi

PARSED=$(python3 - <<'PY' "$CLEAN_DB_URL"
import sys
from urllib.parse import urlparse
url = urlparse(sys.argv[1])
user = url.username or 'unknown'
host = url.hostname or 'unknown-host'
port = url.port or 'default'
db = (url.path or '/').lstrip('/') or 'postgres'
masked_password = '***' if url.password else ''
if url.password:
    netloc = f"{user}:{masked_password}@{host}:{port}"
else:
    netloc = f"{user}@{host}:{port}"
print(f"{netloc}/{db}")
print(db)
PY
)

IFS=$'\n' read -r MASKED_INFO DB_NAME <<< "$PARSED"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "Testing DigitalOcean Database Connection"
echo "=========================================="
echo ""
echo "Connection: $MASKED_INFO"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ psql not found. Please install PostgreSQL client tools${NC}"
    exit 1
fi

echo "🔄 Testing connection..."
if psql "$CLEAN_DB_URL" -c "SELECT version(), current_database(), current_user();" 2>&1; then
    
    echo ""
    echo -e "${GREEN}✅ Connection successful!${NC}"
    echo ""
    
    # Get database info
    echo "📊 Database Information:"
    psql "$CLEAN_DB_URL" \
        -c "SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size, (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') AS table_count;" 2>&1
    
    echo ""
    echo -e "${GREEN}✅ Ready to restore!${NC}"
    echo "   Run: ./restore-to-digitalocean.sh"
    
else
    echo ""
    echo -e "${RED}❌ Connection failed!${NC}"
    echo ""
    echo "Please check:"
    echo "- Network connectivity"
    echo "- Database credentials"
    echo "- Firewall rules (DigitalOcean allows connections from your IP)"
    echo "- SSL certificate validity"
    exit 1
fi

